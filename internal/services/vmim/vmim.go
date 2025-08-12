package vmim

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/client-go/kubernetes"
)

// FetchVMIMData retrieves Virtual Machine Instance Migrations(VMIM) data from the Kubernetes API.
// It takes a client, VMIM name, absolute path, namespace, and resource type.
// Returns the LHVA data as a map and any error encountered.
func FetchVMIMData(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	vmimRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get VMIM data: %w", err)
	}

	var vmimData map[string]interface{}
	err = json.Unmarshal(vmimRaw, &vmimData)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal VMIM data: %w", err)
	}
	return vmimData, nil
}

// ParseVMIMSpec extracts the volume name from PVC spec data.
// It returns the volume name and any error encountered during extraction.
func ParseVMIMSpec(vmimData map[string]interface{}) (string, error) {
	if vmimData == nil {
		return "", fmt.Errorf("VMIM data is nil")
	}

	specRaw, ok := vmimData["spec"]
	if !ok {
		return "", fmt.Errorf("spec field missing in VMIM data")
	}

	vmimSpec, ok := specRaw.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("spec field is not an object")
	}

	vmiNameRaw, ok := vmimSpec["vmiName"]
	if !ok {
		return "", fmt.Errorf("vmiName field missing in PVC spec")
	}

	vmiName, ok := vmiNameRaw.(string)
	if !ok {
		return "", fmt.Errorf("vmiName is not a string")
	}

	if vmiName == "" {
		return "", fmt.Errorf("vmiName is empty")
	}
	fmt.Printf("VMI name is: %v", vmiName)
	return vmiName, nil
}

// ParseVMIMStatus extracts the migration status from VMIM status data.
// and any error encountered during extraction.
func ParseVMIMStatus(vmimData map[string]interface{}) (interface{}, error) {
	if vmimData == nil {
		return nil, fmt.Errorf("VMIM data is nil")
	}

	statusRaw, ok := vmimData["status"]
	if !ok {
		return nil, fmt.Errorf("status field missing in VMIM data")
	}

	vmimStatus, ok := statusRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("status field is not an object")
	}

	migrationstatusRaw, ok := vmimStatus["migrationState"]
	if !ok {
		return nil, fmt.Errorf("migrationState field missing in VMIM status")
	}
	fmt.Printf("MigrationStatus is: %v", migrationstatusRaw)
	return migrationstatusRaw, nil
}
