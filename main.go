package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	kubeclient "github.com/rk280392/harvesterNavigator/internal/client"
	types "github.com/rk280392/harvesterNavigator/internal/models"
	"github.com/rk280392/harvesterNavigator/internal/services/loganalysis"
	"github.com/rk280392/harvesterNavigator/internal/services/volume"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

//go:embed index.html js/* styles/*
var staticFiles embed.FS

var version = "dev"

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

func getDefaultResourcePaths(namespace string) types.ResourcePaths {
	return types.ResourcePaths{
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

func handleAnalyzeLogs(clientset *kubernetes.Clientset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req types.LogAnalysisRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		// Default to gemini if not specified
		if req.Provider == "" {
			req.Provider = "gemini"
		}

		// Create the appropriate analyzer
		var analyzer loganalysis.LogAnalyzer

		switch req.Provider {
		case "gemini":
			apiKey := os.Getenv("GEMINI_API_KEY")
			if apiKey == "" {
				http.Error(w, "GEMINI_API_KEY environment variable not set", http.StatusInternalServerError)
				return
			}
			geminiAnalyzer, err := loganalysis.NewGeminiAnalyzer(r.Context(), apiKey)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to create Gemini analyzer: %v", err), http.StatusInternalServerError)
				return
			}
			defer func() { _ = geminiAnalyzer.Close() }()
			analyzer = geminiAnalyzer
		case "ollama":
			ollamaAnalyzer, err := loganalysis.NewOllamaAnalyzer("http://localhost:11434", "mixtral:8x7b")
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to create Ollama analyzer: %v", err), http.StatusInternalServerError)
				return
			}
			analyzer = ollamaAnalyzer
		case "stub":
			analyzer = loganalysis.NewStubAnalyzer()
		default:
			http.Error(w, "Invalid provider. Use 'gemini' or 'stub'", http.StatusBadRequest)
			return
		}

		logs, err := loganalysis.CollectLogsForIssue(r.Context(), clientset, req)
		if err != nil {
			log.Printf("Warning: Could not collect logs: %v", err)
			// Continue without logs
			logs = fmt.Sprintf("(Log collection failed: %v)", err)
		} else {
			log.Printf("Collected %d characters of logs", len(logs))
		}

		// Build a simple prompt (we'll improve this later)
		prompt := loganalysis.BuildAnalysisPrompt(req)
		fullPrompt := fmt.Sprintf("%s\n\nRELEVANT LOGS:\n%s", prompt, logs)
		// Call the analyzer

		log.Println("===== PROMPT BEING SENT TO AI =====")
		log.Println(fullPrompt)
		log.Println("===== END PROMPT =====")
		result, err := analyzer.Analyze(r.Context(), fullPrompt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(result); err != nil {
			log.Printf("JSON encoding error: %v", err)
		}
	}
}

func main() {
	port := flag.String("port", "8080", "Port to run the server on")
	showVersion := flag.Bool("version", false, "Show version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("Harvester Navigator %s\n", version)
		os.Exit(0)
	}

	log.Printf("Starting Harvester Navigator Backend (version: %s)...", version)
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

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			// Serve index.html for root requests
			data, err := staticFiles.ReadFile("index.html")
			if err != nil {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "text/html")
			if _, err := w.Write(data); err != nil {
				log.Printf("Failed to write response: %v", err)
				return
			}
			return
		}

		// Let other paths fall through to the file server
		http.NotFound(w, r)
	})
	http.HandleFunc("/api/analyze-logs", handleAnalyzeLogs(clientset))

	// Serve JS files
	jsFS, _ := fs.Sub(staticFiles, "js")
	http.Handle("/js/", http.StripPrefix("/js/", http.FileServer(http.FS(jsFS))))

	// Serve CSS files
	stylesFS, _ := fs.Sub(staticFiles, "styles")
	http.Handle("/styles/", http.StripPrefix("/styles/", http.FileServer(http.FS(stylesFS))))

	// Your existing data handler stays the same
	http.HandleFunc("/data", handleData(clientset, config))

	serverAddr := ":" + *port
	log.Printf("Backend server started on port %s. Open http://localhost:%s in your browser.", *port, *port)

	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
