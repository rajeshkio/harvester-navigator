package kubeclient

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/time/rate"
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

	// Optimize client configuration for better performance
	if config != nil {
		// Increase rate limits to handle burst requests
		config.QPS = 50    // Default is 5
		config.Burst = 100 // Default is 10
		
		// Set reasonable timeouts
		config.Timeout = 30 * time.Second
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

// RateLimitedClient wraps the Kubernetes clientset with rate limiting
type RateLimitedClient struct {
	*kubernetes.Clientset
	limiter *rate.Limiter
}

// CreateRateLimitedClient creates a new rate-limited Kubernetes client
func CreateRateLimitedClient(kubeconfig string) (*RateLimitedClient, error) {
	clientset, err := CreateClient(kubeconfig)
	if err != nil {
		return nil, err
	}

	// Allow 20 requests per second with burst of 40
	// This helps prevent overwhelming the API server
	limiter := rate.NewLimiter(20, 40)

	return &RateLimitedClient{
		Clientset: clientset,
		limiter:   limiter,
	}, nil
}

// WaitForRateLimit waits for rate limiter before making API calls
func (r *RateLimitedClient) WaitForRateLimit() error {
	return r.limiter.Wait(context.Background())
}
