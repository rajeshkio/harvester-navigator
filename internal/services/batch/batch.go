package batch

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
)

// BatchFetcher handles batched API requests with caching
type BatchFetcher struct {
	client *kubernetes.Clientset
	cache  *APICache
}

// APICache stores frequently accessed API responses
type APICache struct {
	data  map[string]CacheEntry
	mutex sync.RWMutex
	ttl   time.Duration
}

// CacheEntry represents a cached API response
type CacheEntry struct {
	Data      interface{}
	Timestamp time.Time
}

// BatchRequest represents a single API request
type BatchRequest struct {
	ID        string
	AbsPath   string
	Namespace string
	Resource  string
	Name      string // Optional - for single resource requests
}

// BatchResponse represents the response for a batch request
type BatchResponse struct {
	ID    string
	Data  map[string]interface{}
	Error error
}

// CreateBatchFetcher creates a batch fetcher with caching
func CreateBatchFetcher(client *kubernetes.Clientset) *BatchFetcher {
	return &BatchFetcher{
		client: client,
		cache:  CreateAPICache(5 * time.Minute), // 5 minute TTL
	}
}

// CreateAPICache creates an API cache with specified TTL
func CreateAPICache(ttl time.Duration) *APICache {
	return &APICache{
		data: make(map[string]CacheEntry),
		ttl:  ttl,
	}
}

// ExecuteBatch executes multiple API requests concurrently with rate limiting
func (bf *BatchFetcher) ExecuteBatch(requests []BatchRequest, maxConcurrency int) []BatchResponse {
	if maxConcurrency <= 0 {
		maxConcurrency = 10 // Default concurrency
	}

	responses := make([]BatchResponse, len(requests))

	// Use buffered channel as a semaphore for controlling concurrency
	semaphore := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	for i, req := range requests {
		wg.Add(1)

		go func(index int, request BatchRequest) {
			defer wg.Done()

			// Acquire semaphore
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Check cache first
			if cachedData := bf.cache.Get(request.ID); cachedData != nil {
				responses[index] = BatchResponse{
					ID:   request.ID,
					Data: cachedData.(map[string]interface{}),
				}
				return
			}

			// Execute API request
			data, err := bf.executeRequest(request)
			responses[index] = BatchResponse{
				ID:    request.ID,
				Data:  data,
				Error: err,
			}

			// Cache successful responses
			if err == nil && data != nil {
				bf.cache.Set(request.ID, data)
			}
		}(i, req)
	}

	wg.Wait()
	return responses
}

// executeRequest executes a single API request
func (bf *BatchFetcher) executeRequest(req BatchRequest) (map[string]interface{}, error) {
	var restClient = bf.client.RESTClient().Get().AbsPath(req.AbsPath)

	if req.Namespace != "" {
		restClient = restClient.Namespace(req.Namespace)
	}

	restClient = restClient.Resource(req.Resource)

	if req.Name != "" {
		restClient = restClient.Name(req.Name)
	}

	raw, err := restClient.Do(context.Background()).Raw()
	if err != nil {
		return nil, fmt.Errorf("API request failed for %s: %w", req.ID, err)
	}

	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response for %s: %w", req.ID, err)
	}

	return data, nil
}

// Get retrieves data from cache if not expired
func (c *APICache) Get(key string) interface{} {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	entry, exists := c.data[key]
	if !exists {
		return nil
	}

	// Check if entry has expired
	if time.Since(entry.Timestamp) > c.ttl {
		// Entry expired, remove it
		delete(c.data, key)
		return nil
	}

	return entry.Data
}

// Set stores data in cache with current timestamp
func (c *APICache) Set(key string, data interface{}) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.data[key] = CacheEntry{
		Data:      data,
		Timestamp: time.Now(),
	}
}

// Clear removes all cached entries
func (c *APICache) Clear() {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.data = make(map[string]CacheEntry)
}

// Size returns the number of cached entries
func (c *APICache) Size() int {
	c.mutex.RLock()
	defer c.mutex.RUnlock()
	return len(c.data)
}

// BatchFetchLonghornResources fetches all Longhorn resources in batch
func (bf *BatchFetcher) BatchFetchLonghornResources() (map[string]map[string]interface{}, error) {
	requests := []BatchRequest{
		{
			ID:        "volumes",
			AbsPath:   "apis/longhorn.io/v1beta2",
			Namespace: "longhorn-system",
			Resource:  "volumes",
		},
		{
			ID:        "replicas",
			AbsPath:   "apis/longhorn.io/v1beta2",
			Namespace: "longhorn-system",
			Resource:  "replicas",
		},
		{
			ID:        "engines",
			AbsPath:   "apis/longhorn.io/v1beta2",
			Namespace: "longhorn-system",
			Resource:  "engines",
		},
		{
			ID:        "nodes",
			AbsPath:   "apis/longhorn.io/v1beta2",
			Namespace: "longhorn-system",
			Resource:  "nodes",
		},
	}

	responses := bf.ExecuteBatch(requests, 4) // Use 4 concurrent requests

	result := make(map[string]map[string]interface{})
	for _, resp := range responses {
		if resp.Error != nil {
			log.Printf("Warning: Failed to fetch %s: %v", resp.ID, resp.Error)
			continue
		}
		result[resp.ID] = resp.Data
	}

	return result, nil
}

// BatchFetchPVCs fetches multiple PVCs in batch
func (bf *BatchFetcher) BatchFetchPVCs(pvcList []PVCRequest) map[string]map[string]interface{} {
	requests := make([]BatchRequest, len(pvcList))

	for i, pvc := range pvcList {
		requests[i] = BatchRequest{
			ID:        fmt.Sprintf("pvc-%s-%s", pvc.Namespace, pvc.Name),
			AbsPath:   "/api/v1",
			Namespace: pvc.Namespace,
			Resource:  "persistentvolumeclaims",
			Name:      pvc.Name,
		}
	}

	responses := bf.ExecuteBatch(requests, 10) // Higher concurrency for PVCs

	result := make(map[string]map[string]interface{})
	for _, resp := range responses {
		if resp.Error != nil {
			log.Printf("Warning: Failed to fetch PVC %s: %v", resp.ID, resp.Error)
			continue
		}
		result[resp.ID] = resp.Data
	}

	return result
}

// PVCRequest represents a PVC to fetch
type PVCRequest struct {
	Name      string
	Namespace string
}

// BatchFetchPVs fetches multiple Persistent Volumes in batch
func (bf *BatchFetcher) BatchFetchPVs(pvNames []string) map[string]map[string]interface{} {
	requests := make([]BatchRequest, len(pvNames))

	for i, pvName := range pvNames {
		requests[i] = BatchRequest{
			ID:       fmt.Sprintf("pv-%s", pvName),
			AbsPath:  "/api/v1",
			Resource: "persistentvolumes",
			Name:     pvName,
		}
	}

	responses := bf.ExecuteBatch(requests, 10)

	result := make(map[string]map[string]interface{})
	for _, resp := range responses {
		if resp.Error != nil {
			log.Printf("Warning: Failed to fetch PV %s: %v", resp.ID, resp.Error)
			continue
		}
		result[resp.ID] = resp.Data
	}

	return result
}
