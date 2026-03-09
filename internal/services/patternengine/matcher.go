package patternengine

import (
	"fmt"
	"regexp"
	"strings"
)

// MatcherV2 provides pattern matching for PatternV2
type MatcherV2 struct {
	pattern PatternV2
}

// NewMatcherV2 creates a new v2 pattern matcher
func NewMatcherV2(p PatternV2) *MatcherV2 {
	return &MatcherV2{pattern: p}
}

// Match checks if content matches the pattern, returns all matches found
func (m *MatcherV2) Match(content string) []MatchResultV2 {
	var results []MatchResultV2
	contentLower := strings.ToLower(content)
	hasRegexMatch := false

	for _, matcher := range m.pattern.Matchers {
		if matcher.Type == "regex" {
			re, err := regexp.Compile(matcher.Pattern)
			if err != nil {
				continue
			}
			matches := re.FindAllStringSubmatch(content, -1)
			if matches == nil {
				continue
			}
			hasRegexMatch = true
			for _, match := range matches {
				metadata := make(map[string]string)
				for i, name := range re.SubexpNames() {
					if i != 0 && name != "" && i < len(match) {
						metadata[name] = match[i]
					}
				}
				results = append(results, MatchResultV2{
					Matched:     true,
					PatternID:   m.pattern.ID,
					PatternName: m.pattern.Name,
					Severity:    m.pattern.Severity,
					Confidence:  m.pattern.Confidence,
					Message:     m.detectedMessage(),
					Evidence:    []string{match[0]},
					Metadata:    metadata,
				})
			}
		} else {
			// keyword matcher — skip if regex already matched
			if hasRegexMatch {
				continue
			}
			patternLower := strings.ToLower(matcher.Pattern)
			if strings.Contains(contentLower, patternLower) {
				// Sum occurrences across all matching keywords for accurate frequency
				totalOcc := 0
				for _, km := range m.pattern.Matchers {
					if km.Type != "regex" {
						totalOcc += strings.Count(contentLower, strings.ToLower(km.Pattern))
					}
				}
				results = append(results, MatchResultV2{
					Matched:         true,
					PatternID:       m.pattern.ID,
					PatternName:     m.pattern.Name,
					Severity:        m.pattern.Severity,
					Confidence:      m.pattern.Confidence,
					Message:         m.detectedMessage(),
					Evidence:        []string{m.extractEvidence(matcher, content)},
					Metadata:        make(map[string]string),
					OccurrenceCount: totalOcc,
				})
				break // one result per pattern
			}
		}
	}

	if len(results) == 0 {
		return []MatchResultV2{{Matched: false}}
	}
	return results
}

func (m *MatcherV2) extractEvidence(matcher Matcher, content string) string {
	lines := strings.Split(content, "\n")
	patternLower := strings.ToLower(matcher.Pattern)
	for _, line := range lines {
		if strings.Contains(strings.ToLower(line), patternLower) {
			return strings.TrimSpace(line)
		}
	}
	return matcher.Pattern
}

func (m *MatcherV2) detectedMessage() string {
	return fmt.Sprintf("[%s] %s: %s",
		strings.ToUpper(string(m.pattern.Severity)),
		m.pattern.Name,
		m.pattern.Description)
}
