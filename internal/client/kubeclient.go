package kubeclient

import (
	"fmt"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// createKubeConfig creates a Kubernetes client config from the specified kubeconfig path.
// This function assumes the kubeconfig path has already been validated.
func createKubeConfig(kubeconfig string) (*rest.Config, error) {
	var config *rest.Config
	var err error

	if kubeconfig != "" {
		// Use the provided kubeconfig file path
		//	fmt.Printf("kubeconfig from createkubeconfig%v\n", kubeconfig)
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build config from kubeconfig '%s': %w", kubeconfig, err)
		}
	}

	//fmt.Printf("config from createkubeconfig%v\n", config)

	return config, nil
}

// NewClient creates a new Kubernetes clientset using the provided kubeconfig path.
// The kubeconfig parameter should be a validated file path.
func NewClient(kubeconfig string) (*kubernetes.Clientset, error) {
	//fmt.Printf("kubeconfig from newclient %s\n", kubeconfig)
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

// NewClientWithConfig creates a new Kubernetes clientset using a provided rest.Config.
// This is useful when you want more control over the configuration.
func NewClientWithConfig(config *rest.Config) (*kubernetes.Clientset, error) {
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
