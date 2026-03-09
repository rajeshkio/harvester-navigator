package patternengine

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
)

// HintGeneratorV2 produces root cause hints from pattern matches
type HintGeneratorV2 struct{}

func newHintGenerator() *HintGeneratorV2 { return &HintGeneratorV2{} }

// Generate creates a hint from a pattern match result
func (hg *HintGeneratorV2) Generate(match MatchResultV2, pattern PatternV2) (*Hint, error) {
	if !match.Matched {
		return nil, fmt.Errorf("cannot generate hint for unmatched pattern")
	}

	hgTemplate := pattern.HintGenerator.Template
	suggestion := pattern.HintGenerator.Suggestion
	command := pattern.HintGenerator.Command
	references := pattern.HintGenerator.References

	summary, err := hg.applyTemplate(hgTemplate, match.Metadata)
	if err != nil || summary == "" {
		summary = fmt.Sprintf("[%s] %s detected", strings.ToUpper(string(match.Severity)), pattern.Name)
	}

	if command != "" {
		command, _ = hg.applyTemplate(command, match.Metadata)
	}

	explanation := hg.buildExplanation(pattern, match)

	return &Hint{
		PatternID:       match.PatternID,
		Severity:        match.Severity,
		Confidence:      match.Confidence,
		Summary:         summary,
		Explanation:     explanation,
		Suggestion:      suggestion,
		Command:         command,
		References:      references,
		Metadata:        match.Metadata,
		OccurrenceCount: match.OccurrenceCount,
	}, nil
}

func (hg *HintGeneratorV2) applyTemplate(tmpl string, data map[string]string) (string, error) {
	if tmpl == "" || !strings.Contains(tmpl, "{{") {
		return tmpl, nil
	}
	t, err := template.New("hint").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	result := buf.String()
	if strings.Contains(result, "<no value>") {
		return "", fmt.Errorf("unresolved template variables")
	}
	return result, nil
}

func (hg *HintGeneratorV2) buildExplanation(pattern PatternV2, match MatchResultV2) string {
	var parts []string
	parts = append(parts, pattern.Description)

	if len(match.Evidence) > 0 {
		parts = append(parts, "\nEvidence:")
		for i, e := range match.Evidence {
			if i < 3 {
				parts = append(parts, "  • "+e)
			}
		}
	}

	if len(match.Correlated) > 0 {
		parts = append(parts, "\nRelated Issues:")
		for _, corrID := range match.Correlated {
			for _, corr := range pattern.Correlations {
				if corr.PatternID == corrID {
					parts = append(parts, "  • "+corr.Message)
				}
			}
		}
	}

	return strings.Join(parts, "\n")
}

// GenerateAll creates hints for all matched patterns
func (hg *HintGeneratorV2) GenerateAll(matches []MatchResultV2, registry *PatternRegistry) []*Hint {
	var hints []*Hint
	for _, match := range matches {
		pattern, found := registry.GetByID(match.PatternID)
		if !found {
			continue
		}
		if match.Metadata == nil {
			match.Metadata = make(map[string]string)
		}
		if len(match.Evidence) > 0 {
			match.Metadata["Evidence"] = match.Evidence[0]
		}
		hint, err := hg.Generate(match, pattern)
		if err != nil {
			continue
		}
		hints = append(hints, hint)
	}
	return hints
}
