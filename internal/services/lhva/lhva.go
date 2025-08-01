package lhva

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/client-go/kubernetes"
)

// FetchLHVAData retrieves Longhorn Volume Attachment (LHVA) data from the Kubernetes API.
// It takes a client, LHVA name, absolute path, namespace, and resource type.
// Returns the LHVA data as a map and any error encountered.
func FetchLHVAData(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	lhvaRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get LHVA data: %w", err)
	}

	var lhvaData map[string]interface{}
	err = json.Unmarshal(lhvaRaw, &lhvaData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal LHVA data: %w", err)
	}
	return lhvaData, nil
}

// ParseLHVAStatus extracts the attachmentTicketStatuses from LHVA status data.
// It returns the attachmentTicketStatuses as an interface{} (to allow for various structures)
// and any error encountered during extraction.
func ParseLHVAStatus(lhvaData map[string]interface{}) (interface{}, error) {
	if lhvaData == nil {
		return nil, fmt.Errorf("LHVA data is nil")
	}

	statusRaw, ok := lhvaData["status"]
	if !ok {
		return nil, fmt.Errorf("status field missing in LHVA data")
	}

	lhvaStatus, ok := statusRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("status field is not an object")
	}

	attachmentTicketStatusesRaw, ok := lhvaStatus["attachmentTicketStatuses"]
	if !ok {
		return nil, fmt.Errorf("attachmentTicketStatuses field missing in LHVA status")
	}
	fmt.Printf("attachmentticketstatuses is: %v \n", attachmentTicketStatusesRaw)
	return attachmentTicketStatusesRaw, nil
}
