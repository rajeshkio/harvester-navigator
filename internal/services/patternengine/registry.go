package patternengine

import "fmt"

// PatternRegistry manages all pattern definitions
type PatternRegistry struct {
	patterns []PatternV2
}

// NewRegistry creates a registry loaded with all built-in patterns (generic + Harvester-specific)
func NewRegistry() *PatternRegistry {
	all := make([]PatternV2, 0, len(genericPatterns)+len(harvesterPatterns))
	all = append(all, genericPatterns...)
	all = append(all, harvesterPatterns...)
	return &PatternRegistry{patterns: all}
}

// Register adds a custom pattern
func (r *PatternRegistry) Register(p PatternV2) error {
	if p.ID == "" {
		return fmt.Errorf("pattern ID is required")
	}
	if p.Name == "" {
		return fmt.Errorf("pattern name is required")
	}
	if len(p.Matchers) == 0 {
		return fmt.Errorf("at least one matcher is required")
	}
	r.patterns = append(r.patterns, p)
	return nil
}

// GetByID retrieves a pattern by ID
func (r *PatternRegistry) GetByID(id string) (PatternV2, bool) {
	for _, p := range r.patterns {
		if p.ID == id {
			return p, true
		}
	}
	return PatternV2{}, false
}

// GetAll returns all registered patterns
func (r *PatternRegistry) GetAll() []PatternV2 {
	return r.patterns
}

// AnalyzeV2 scans content against all patterns, returns matches with correlations filled in
func (r *PatternRegistry) AnalyzeV2(content string) []MatchResultV2 {
	var matches []MatchResultV2
	matchedIDs := make(map[string]bool)

	for _, pattern := range r.patterns {
		matcher := NewMatcherV2(pattern)
		results := matcher.Match(content)
		for _, result := range results {
			if result.Matched {
				matches = append(matches, result)
				matchedIDs[pattern.ID] = true
			}
		}
	}

	// Second pass: fill in correlations
	for i := range matches {
		pattern, found := r.GetByID(matches[i].PatternID)
		if !found {
			continue
		}
		for _, corr := range pattern.Correlations {
			if matchedIDs[corr.PatternID] {
				matches[i].Correlated = append(matches[i].Correlated, corr.PatternID)
			}
		}
	}

	return matches
}
