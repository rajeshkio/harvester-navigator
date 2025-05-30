package vm

import (
	"context"
	"encoding/json"
	"fmt"

	types "github.com/rk280392/harvesterNavigator/internal/models"
	"k8s.io/client-go/kubernetes"
)

// FetchVMData retrieves virtual machine data from the Kubernetes API.
// It takes a client, VM name, absolute path, namespace, and resource type.
// Returns the VM data as a map and any error encountered.
func FetchVMData(client *kubernetes.Clientset, name, absPath, namespace, resource string) (map[string]interface{}, error) {
	vmRaw, err := client.RESTClient().Get().
		AbsPath(absPath).
		Namespace(namespace).
		Name(name).
		Resource(resource).
		Do(context.Background()).Raw()

	if err != nil {
		return nil, fmt.Errorf("failed to get VM data: %w", err)
	}

	var vmData map[string]interface{}
	if err := json.Unmarshal(vmRaw, &vmData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal VM data: %w", err)
	}

	return vmData, nil
}

// ToVMStatus converts a string to a VMStatus type
func ToVMStatus(s string) types.VMStatus {
	return types.VMStatus(s)
}

// ParseVMMetaData extracts relevant information from VM data and populates the VMInfo struct.
// It processes metadata, status, and volume claim templates to populate the VMInfo object.
func ParseVMMetaData(vmData map[string]interface{}, vmInfo *types.VMInfo) error {
	if vmData == nil {
		return fmt.Errorf("VM data is nil")
	}

	// Extract metadata
	metadata, err := extractMetadata(vmData)
	if err != nil {
		return err
	}

	// Extract status information
	extractStatus(vmData, vmInfo)

	// Extract volume claim templates from annotations
	return extractVolumeClaimTemplates(metadata, vmInfo)
}

// extractMetadata extracts and validates the metadata section from VM data
func extractMetadata(vmData map[string]interface{}) (map[string]interface{}, error) {
	metadataRaw, ok := vmData["metadata"]
	if !ok {
		return nil, fmt.Errorf("metadata field missing")
	}

	metadata, ok := metadataRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("metadata field is not an object")
	}

	return metadata, nil
}

// extractStatus extracts status information from VM data and updates the VMInfo struct
func extractStatus(vmData map[string]interface{}, vmInfo *types.VMInfo) {
	statusRaw, ok := vmData["status"]
	if !ok {
		return
	}

	status, ok := statusRaw.(map[string]interface{})
	if !ok {
		return
	}

	// Extract printable status if available
	extractPrintableStatus(status, vmInfo)

	// Extract conditions if available
	extractConditions(status, vmInfo)
}

// extractPrintableStatus extracts the printable status from VM status
func extractPrintableStatus(status map[string]interface{}, vmInfo *types.VMInfo) {
	printableStatusRaw, ok := status["printableStatus"]
	if !ok || printableStatusRaw == nil {
		return
	}

	printableStatus, ok := printableStatusRaw.(string)
	if ok {
		vmInfo.PrintableStatus = printableStatus
	}
}

// extractConditions extracts conditions information from VM status
func extractConditions(status map[string]interface{}, vmInfo *types.VMInfo) {
	conditionsRaw, ok := status["conditions"]
	if !ok || conditionsRaw == nil {
		return
	}

	conditionsArray, ok := conditionsRaw.([]interface{})
	if !ok {
		return
	}

	for _, conditionRaw := range conditionsArray {
		condition, ok := conditionRaw.(map[string]interface{})
		if !ok {
			continue // Skip invalid entries
		}

		// Extract reason
		if reasonRaw, ok := condition["reason"]; ok && reasonRaw != nil {
			if reason, ok := reasonRaw.(string); ok {
				vmInfo.VMStatusReason = reason
			}
		}

		// Extract status
		if statusRaw, ok := condition["status"]; ok && statusRaw != nil {
			if statusStr, ok := statusRaw.(string); ok {
				vmInfo.VMStatus = ToVMStatus(statusStr)
			}
		}
	}
}

// extractVolumeClaimTemplates extracts volume claim templates from metadata annotations
func extractVolumeClaimTemplates(metadata map[string]interface{}, vmInfo *types.VMInfo) error {
	// Extract annotations
	annotations, err := extractAnnotations(metadata)
	if err != nil {
		return err
	}

	// Extract volume claim templates string
	volumeClaimTemplateStr, err := extractVolumeClaimTemplatesString(annotations)
	if err != nil {
		return err
	}

	// Parse volume claim templates
	volumeClaimTemplates, err := parseVolumeClaimTemplates(volumeClaimTemplateStr)
	if err != nil {
		return err
	}

	if len(volumeClaimTemplates) == 0 {
		return fmt.Errorf("no volume claim templates found")
	}

	// Process the first template
	return processVolumeClaimTemplate(volumeClaimTemplates[0], vmInfo)
}

// extractAnnotations extracts annotations from metadata
func extractAnnotations(metadata map[string]interface{}) (map[string]interface{}, error) {
	annotationsRaw, ok := metadata["annotations"]
	if !ok {
		return nil, fmt.Errorf("annotations field missing")
	}

	annotations, ok := annotationsRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("annotations is not an object")
	}

	return annotations, nil
}

// extractVolumeClaimTemplatesString extracts the volume claim templates string from annotations
func extractVolumeClaimTemplatesString(annotations map[string]interface{}) (string, error) {
	volumeClaimTemplateRaw, ok := annotations["harvesterhci.io/volumeClaimTemplates"]
	if !ok {
		return "", fmt.Errorf("volumeClaimTemplates annotation missing")
	}

	volumeClaimTemplateStr, ok := volumeClaimTemplateRaw.(string)
	if !ok {
		return "", fmt.Errorf("volumeClaimTemplates is not a string")
	}

	return volumeClaimTemplateStr, nil
}

// parseVolumeClaimTemplates parses the volume claim templates string into a slice of maps
func parseVolumeClaimTemplates(volumeClaimTemplateStr string) ([]map[string]interface{}, error) {
	var volumeClaimTemplates []map[string]interface{}
	err := json.Unmarshal([]byte(volumeClaimTemplateStr), &volumeClaimTemplates)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal volume claim templates: %w", err)
	}

	return volumeClaimTemplates, nil
}

// processVolumeClaimTemplate processes a single volume claim template and updates the VMInfo struct
func processVolumeClaimTemplate(template map[string]interface{}, vmInfo *types.VMInfo) error {
	// Extract template metadata
	templateMetadata, err := extractTemplateMetadata(template)
	if err != nil {
		return err
	}

	// Extract PVC claim name
	err = extractPVCClaimName(templateMetadata, vmInfo)
	if err != nil {
		return err
	}

	// Extract image ID from template metadata annotations
	extractImageID(templateMetadata, vmInfo)

	// Extract storage class from template spec
	return extractStorageClass(template, vmInfo)
}

// extractTemplateMetadata extracts metadata from a template
func extractTemplateMetadata(template map[string]interface{}) (map[string]interface{}, error) {
	templateMetadataRaw, ok := template["metadata"]
	if !ok {
		return nil, fmt.Errorf("template metadata missing")
	}

	templateMetadata, ok := templateMetadataRaw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("template metadata is not an object")
	}

	return templateMetadata, nil
}

// extractPVCClaimName extracts the PVC claim name from template metadata
func extractPVCClaimName(templateMetadata map[string]interface{}, vmInfo *types.VMInfo) error {
	nameRaw, ok := templateMetadata["name"]
	if !ok || nameRaw == nil {
		return fmt.Errorf("PVC claim name missing")
	}

	name, ok := nameRaw.(string)
	if !ok {
		return fmt.Errorf("PVC claim name is not a string")
	}

	vmInfo.ClaimNames = name
	return nil
}

// extractImageID extracts the image ID from template metadata annotations
func extractImageID(templateMetadata map[string]interface{}, vmInfo *types.VMInfo) {
	// This is optional, so we don't return errors
	templateMetaAnnotationRaw, ok := templateMetadata["annotations"]
	if !ok || templateMetaAnnotationRaw == nil {
		return
	}

	templateMetaAnnotation, ok := templateMetaAnnotationRaw.(map[string]interface{})
	if !ok {
		return
	}

	imageIDRaw, ok := templateMetaAnnotation["harvesterhci.io/imageId"]
	if !ok || imageIDRaw == nil {
		return
	}

	imageID, ok := imageIDRaw.(string)
	if ok {
		vmInfo.ImageId = imageID
	}
}

// extractStorageClass extracts the storage class from template spec
func extractStorageClass(template map[string]interface{}, vmInfo *types.VMInfo) error {
	templateSpecRaw, ok := template["spec"]
	if !ok {
		return fmt.Errorf("template spec missing")
	}

	templateSpec, ok := templateSpecRaw.(map[string]interface{})
	if !ok {
		return fmt.Errorf("template spec is not an object")
	}

	storageClassRaw, ok := templateSpec["storageClassName"]
	if !ok || storageClassRaw == nil {
		return fmt.Errorf("storageClassName missing")
	}

	storageClass, ok := storageClassRaw.(string)
	if !ok {
		return fmt.Errorf("storageClassName is not a string")
	}

	vmInfo.StorageClass = storageClass
	return nil
}
