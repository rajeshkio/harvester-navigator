package patternengine

// ShouldAnalyzePattern checks if a pattern meets the minimum severity requirement
func ShouldAnalyzePattern(p PatternV2, opts AnalysisOptions) bool {
	if opts.MinSeverity == "" {
		return true
	}
	return severityOrder(p.Severity) >= severityOrder(opts.MinSeverity)
}

// ShouldIncludeMatch checks if a match result passes filters
func ShouldIncludeMatch(match MatchResultV2, opts AnalysisOptions) bool {
	if !opts.IncludeInfo && match.Severity == SeverityInfo {
		return false
	}
	if opts.MinSeverity != "" && severityOrder(match.Severity) < severityOrder(opts.MinSeverity) {
		return false
	}
	return true
}

func severityOrder(s Severity) int {
	switch s {
	case SeverityCritical:
		return 2
	case SeverityWarning:
		return 1
	default:
		return 0
	}
}

// DetectCorrelations finds co-occurring pattern correlations across all matches
func DetectCorrelations(matches []MatchResultV2, registry *PatternRegistry) []CorrelationMatch {
	var correlations []CorrelationMatch
	matchedIDs := make(map[string]bool)

	for _, match := range matches {
		if match.Matched {
			matchedIDs[match.PatternID] = true
		}
	}

	for _, match := range matches {
		if !match.Matched {
			continue
		}
		pattern, found := registry.GetByID(match.PatternID)
		if !found {
			continue
		}
		for _, corr := range pattern.Correlations {
			if matchedIDs[corr.PatternID] {
				correlations = append(correlations, CorrelationMatch{
					PatternID1: match.PatternID,
					PatternID2: corr.PatternID,
					Message:    corr.Message,
				})
			}
		}
	}
	return correlations
}

// BuildSummary creates analysis summary statistics
func BuildSummary(matches []MatchResultV2, correlations []CorrelationMatch, registry *PatternRegistry) AnalysisSummary {
	s := AnalysisSummary{
		TotalPatterns: len(registry.GetAll()),
		Correlations:  len(correlations),
	}
	for _, match := range matches {
		if match.Matched {
			s.MatchesFound++
			switch match.Severity {
			case SeverityCritical:
				s.CriticalIssues++
			case SeverityWarning:
				s.WarningIssues++
			case SeverityInfo:
				s.InfoIssues++
			}
		}
	}
	return s
}
