package kubeclient

import (
	"fmt"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// createKubeConfig creates a Kubernetes client config from the specified kubeconfig path.
func createKubeConfig(kubeconfig string) (*rest.Config, error) {
	var config *rest.Config
	var err error

	if kubeconfig != "" {
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build config from kubeconfig '%s': %w", kubeconfig, err)
		}
	}

	return config, nil
}

// CreateClient creates a Kubernetes clientset using the provided kubeconfig path.
func CreateClient(kubeconfig string) (*kubernetes.Clientset, error) {
	config, err := createKubeConfig(kubeconfig)
	if err != nil {
		return nil, err
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes clientset: %w", err)
	}

	return clientset, nil
}

// CreateClientWithConfig creates a Kubernetes clientset using a provided rest.Config.
func CreateClientWithConfig(config *rest.Config) (*kubernetes.Clientset, error) {
	if config == nil {
		return nil, fmt.Errorf("config cannot be nil")
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes clientset: %w", err)
	}

	return clientset, nil
}

// GetConfig creates and returns a Kubernetes client config without creating a clientset.
// This is useful when you need the config for other purposes.
func GetConfig(kubeconfig string) (*rest.Config, error) {
	return createKubeConfig(kubeconfig)
}
