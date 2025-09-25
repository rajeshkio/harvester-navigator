package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	kubeclient "github.com/rk280392/harvesterNavigator/internal/client"
	models "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/volume"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func determineKubeconfigPath() (string, string, error) {
	if kubeconfigEnv := os.Getenv("KUBECONFIG"); kubeconfigEnv != "" {
		separator := ":"
		if os.PathSeparator == '\\' {
			separator = ";"
		}

		paths := strings.Split(kubeconfigEnv, separator)
		for i, path := range paths {
			path = strings.TrimSpace(path)
			if path == "" {
				continue
			}

			if strings.HasPrefix(path, "~/") {
				if home, err := os.UserHomeDir(); err == nil {
					path = filepath.Join(home, path[2:])
				}
			}

			if _, err := os.Stat(path); err == nil {
				source := fmt.Sprintf("KUBECONFIG environment variable (path %d of %d)", i+1, len(paths))
				return path, source, nil
			}
		}

		log.Printf("Warning: KUBECONFIG environment variable is set to '%s' but no valid files found", kubeconfigEnv)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", fmt.Errorf("could not determine home directory: %w", err)
	}

	simPath := filepath.Join(home, ".sim", "admin.kubeconfig")
	if _, err := os.Stat(simPath); err == nil {
		return simPath, "Harvester simulator location (~/.sim/admin.kubeconfig)", nil
	}

	currentDir, _ := os.Getwd()
	commonNames := []string{"kubeconfig", "admin.kubeconfig", "config"}

	for _, name := range commonNames {
		path := filepath.Join(currentDir, name)
		if _, err := os.Stat(path); err == nil {
			return path, fmt.Sprintf("current directory (./%s)", name), nil
		}
	}

	return "", "", fmt.Errorf("no kubeconfig file found. Searched locations:\n"+
		"  1. KUBECONFIG environment variable\n"+
		"  2. %s\n"+
		"  3. Current directory (kubeconfig, admin.kubeconfig, config)", simPath)
}

func validateKubeconfig(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("cannot access kubeconfig file: %w", err)
	}

	if info.IsDir() {
		return fmt.Errorf("kubeconfig path points to a directory, not a file")
	}

	if info.Size() == 0 {
		return fmt.Errorf("kubeconfig file is empty")
	}

	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("cannot read kubeconfig file: %w", err)
	}
	if err := file.Close(); err != nil {
		log.Printf("Failed to close file: %v", err)
	}

	return nil
}

func logStorageBackends(clientset *kubernetes.Clientset) {
	backends, err := volume.DiscoverStorageBackends(clientset)
	if err != nil {
		log.Printf("Warning: Could not discover storage backends: %v", err)
		return
	}

	log.Println("=== Discovered Storage Backends ===")
	for _, backend := range backends {
		defaultStr := ""
		if backend.IsDefault {
			defaultStr = " (default)"
		}
		log.Printf("  %s: %s%s (%d storage classes)",
			backend.CSIDriver, backend.Name, defaultStr, backend.VolumeCount)
	}
	log.Println("=====================================")
}

func getDefaultResourcePaths(namespace string) models.ResourcePaths {
	return models.ResourcePaths{
		VMPath:           "apis/kubevirt.io/v1",
		PVCPath:          "/api/v1",
		LHVAPath:         "/apis/longhorn.io/v1beta2",
		VolumePath:       "apis/longhorn.io/v1beta2",
		ReplicaPath:      "apis/longhorn.io/v1beta2",
		EnginePath:       "apis/longhorn.io/v1beta2",
		VMIPath:          "apis/kubevirt.io/v1",
		VMIMPath:         "apis/kubevirt.io/v1",
		PodPath:          "/api/v1",
		VolumeNamespace:  "longhorn-system",
		ReplicaNamespace: "longhorn-system",
		EngineNamespace:  "longhorn-system",
		Namespace:        namespace,
	}
}

func handleData(clientset *kubernetes.Clientset, config *rest.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		dynamicClient, err := dynamic.NewForConfig(config)
		if err != nil {
			log.Printf("Warning: Could not create dynamic client: %v", err)
			http.Error(w, "Failed to create dynamic client", http.StatusInternalServerError)
			return
		}
		dataFetcher := CreateDataFetcher(clientset, dynamicClient)
		data, err := dataFetcher.fetchFullClusterData()
		if err != nil {
			log.Printf("Error: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(data); err != nil {
			http.Error(w, "Failed to encode response", http.StatusInternalServerError)
			log.Printf("JSON encoding error: %v", err)
			return
		}
		log.Printf("Data sent in %v", time.Since(start))
	}
}
func main() {
	log.Println("Starting Harvester Navigator Backend...")
	kubeconfigPath, source, err := determineKubeconfigPath()
	if err != nil {
		log.Fatalf("Error: %v", err)
	}
	if err := validateKubeconfig(kubeconfigPath); err != nil {
		log.Fatalf("Error: Invalid kubeconfig file at %s: %v", kubeconfigPath, err)
	}
	log.Printf("Using kubeconfig: %s", kubeconfigPath)
	log.Printf("Source: %s", source)

	config, err := kubeclient.GetConfig(kubeconfigPath)
	if err != nil {
		log.Fatalf("Error creating Kubernetes config: %v", err)
	}
	clientset, err := kubeclient.CreateClientWithConfig(config)
	if err != nil {
		log.Fatalf("Error creating Kubernetes client: %v", err)
	}
	log.Println("Kubernetes client initialized.")

	serverVersion, err := clientset.Discovery().ServerVersion()
	if err != nil {
		log.Printf("Warning: Could not retrieve server version (connectivity issue?): %v", err)
	} else {
		log.Printf("Connected to Kubernetes cluster (version: %s)", serverVersion.String())
	}
	logStorageBackends(clientset)

	http.Handle("/", http.FileServer(http.Dir(".")))
	http.HandleFunc("/data", handleData(clientset, config))

	log.Println("Backend server started. Open http://localhost:8080 in your browser.")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
