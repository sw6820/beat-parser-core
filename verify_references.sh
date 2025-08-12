#!/bin/bash

# Beat Parser Documentation Reference Verification Script
# Checks for broken references after redundant file deletion
# Version: 1.0

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Files that will be or have been deleted
DELETED_FILES=(
    "API_TESTING_REPORT.md"
    "API_TESTING_SUMMARY.md"
    "ERROR_HANDLING_REPORT.md"
    "ERROR_HANDLING_SUMMARY.md"
    "INTEGRATION_TESTING_REPORT.md"
    "INTEGRATION_TESTING_SUMMARY.md"
    "WORKER_TESTING_REPORT.md"
    "WORKER_TESTING_SUMMARY.md"
    "CROSS_PLATFORM_REPORT.md"
    "CROSS_PLATFORM_SUMMARY.md"
    "AUDIO_INPUT_TEST_REPORT.md"
    "GENRE_TESTING_SUMMARY.md"
    "IMPLEMENTATION_SUMMARY.md"
    "ENHANCED_ALGORITHMS.md"
)

# Consolidated files that should exist
REQUIRED_FILES=(
    "API_TESTING.md"
    "ERROR_HANDLING_TESTING.md"
    "INTEGRATION_TESTING.md"
    "WORKER_TESTING.md"
    "CROSS_PLATFORM_TESTING.md"
    "AUDIO_INPUT_TESTING.md"
    "GENRE_TESTING.md"
    "ARCHITECTURE.md"
    "TESTING_INDEX.md"
    "DOCUMENTATION_MAP.md"
)

log_color() {
    echo -e "${2}$1${NC}"
}

check_required_files() {
    log_color "Checking required files exist..." "$BLUE"
    
    local missing_files=0
    for file in "${REQUIRED_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            local line_count=$(wc -l < "$file")
            log_color "✓ $file ($line_count lines)" "$GREEN"
        else
            log_color "✗ MISSING: $file" "$RED"
            ((missing_files++))
        fi
    done
    
    if [[ $missing_files -eq 0 ]]; then
        log_color "All required files present" "$GREEN"
        return 0
    else
        log_color "$missing_files required files missing" "$RED"
        return 1
    fi
}

check_deleted_files() {
    log_color "\nChecking deleted files status..." "$BLUE"
    
    local still_present=0
    for file in "${DELETED_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            log_color "⚠ Still present: $file" "$YELLOW"
            ((still_present++))
        else
            log_color "✓ Deleted: $file" "$GREEN"
        fi
    done
    
    if [[ $still_present -eq 0 ]]; then
        log_color "All redundant files successfully removed" "$GREEN"
        return 0
    else
        log_color "$still_present files still present (may be intentional)" "$YELLOW"
        return 1
    fi
}

check_broken_references() {
    log_color "\nChecking for broken references..." "$BLUE"
    
    local broken_references=0
    
    for deleted_file in "${DELETED_FILES[@]}"; do
        # Find any remaining references to deleted files
        local references=$(find . -name "*.md" -not -path "./.backup/*" -exec grep -l "$deleted_file" {} \; 2>/dev/null || true)
        
        if [[ -n "$references" ]]; then
            log_color "⚠ References found to deleted file: $deleted_file" "$YELLOW"
            echo "$references" | while read -r ref_file; do
                if [[ -f "$ref_file" ]]; then
                    log_color "  Referenced in: $ref_file" "$YELLOW"
                    # Show the actual reference line
                    grep -n "$deleted_file" "$ref_file" | head -3 | while read -r line; do
                        echo "    $line"
                    done
                    ((broken_references++))
                fi
            done
        fi
    done
    
    if [[ $broken_references -eq 0 ]]; then
        log_color "No broken references found" "$GREEN"
        return 0
    else
        log_color "$broken_references potential broken references found" "$YELLOW"
        return 1
    fi
}

verify_navigation_integrity() {
    log_color "\nVerifying navigation file integrity..." "$BLUE"
    
    local nav_issues=0
    
    # Check TESTING_INDEX.md
    if [[ -f "TESTING_INDEX.md" ]]; then
        log_color "Checking TESTING_INDEX.md..." "$BLUE"
        
        # Should only reference consolidated files
        local bad_refs=$(grep -o '\[[^]]*\](\.\/[^)]*REPORT\.md\|\.\/[^)]*SUMMARY\.md)' TESTING_INDEX.md 2>/dev/null || true)
        if [[ -n "$bad_refs" ]]; then
            log_color "⚠ TESTING_INDEX.md contains references to deleted files:" "$YELLOW"
            echo "$bad_refs"
            ((nav_issues++))
        else
            log_color "✓ TESTING_INDEX.md navigation links clean" "$GREEN"
        fi
        
        # Verify it references consolidated files
        local consolidated_refs=0
        for req_file in "API_TESTING.md" "ERROR_HANDLING_TESTING.md" "INTEGRATION_TESTING.md"; do
            if grep -q "$req_file" TESTING_INDEX.md; then
                ((consolidated_refs++))
            fi
        done
        
        if [[ $consolidated_refs -gt 0 ]]; then
            log_color "✓ TESTING_INDEX.md properly references consolidated files ($consolidated_refs found)" "$GREEN"
        else
            log_color "⚠ TESTING_INDEX.md may not properly reference consolidated files" "$YELLOW"
            ((nav_issues++))
        fi
    else
        log_color "✗ TESTING_INDEX.md missing" "$RED"
        ((nav_issues++))
    fi
    
    # Check DOCUMENTATION_MAP.md
    if [[ -f "DOCUMENTATION_MAP.md" ]]; then
        log_color "Checking DOCUMENTATION_MAP.md..." "$BLUE"
        
        # Should not reference deleted files
        local bad_refs=$(grep -o '\[[^]]*\]([^)]*REPORT\.md\|[^)]*SUMMARY\.md)' DOCUMENTATION_MAP.md 2>/dev/null || true)
        if [[ -n "$bad_refs" ]]; then
            log_color "⚠ DOCUMENTATION_MAP.md contains references to deleted files:" "$YELLOW"
            echo "$bad_refs"
            ((nav_issues++))
        else
            log_color "✓ DOCUMENTATION_MAP.md navigation links clean" "$GREEN"
        fi
    else
        log_color "✗ DOCUMENTATION_MAP.md missing" "$RED"
        ((nav_issues++))
    fi
    
    if [[ $nav_issues -eq 0 ]]; then
        log_color "Navigation integrity verified" "$GREEN"
        return 0
    else
        log_color "$nav_issues navigation issues found" "$YELLOW"
        return 1
    fi
}

verify_content_preservation() {
    log_color "\nVerifying content preservation..." "$BLUE"
    
    local content_issues=0
    
    # Check that consolidated files have substantial content
    local files_to_check=(
        "API_TESTING.md:100"
        "ERROR_HANDLING_TESTING.md:100"
        "INTEGRATION_TESTING.md:150"
        "WORKER_TESTING.md:150"
        "CROSS_PLATFORM_TESTING.md:200"
        "AUDIO_INPUT_TESTING.md:100"
        "GENRE_TESTING.md:100"
        "ARCHITECTURE.md:200"
    )
    
    for file_spec in "${files_to_check[@]}"; do
        local file="${file_spec%:*}"
        local expected_lines="${file_spec#*:}"
        
        if [[ -f "$file" ]]; then
            local actual_lines=$(wc -l < "$file")
            
            if [[ $actual_lines -ge $expected_lines ]]; then
                log_color "✓ $file: $actual_lines lines (>= $expected_lines expected)" "$GREEN"
            else
                log_color "⚠ $file: $actual_lines lines (< $expected_lines expected)" "$YELLOW"
                content_issues=$((content_issues + 1))
            fi
        else
            log_color "✗ $file: Missing" "$RED"
            content_issues=$((content_issues + 1))
        fi
    done
    
    if [[ $content_issues -eq 0 ]]; then
        log_color "Content preservation verified" "$GREEN"
        return 0
    else
        log_color "$content_issues content preservation issues found" "$YELLOW"
        return 1
    fi
}

generate_update_commands() {
    log_color "\nGenerating reference update commands..." "$BLUE"
    
    # Find files that might need updating
    local update_needed=false
    
    for deleted_file in "${DELETED_FILES[@]}"; do
        local references=$(find . -name "*.md" -not -path "./.backup/*" -exec grep -l "$deleted_file" {} \; 2>/dev/null || true)
        
        if [[ -n "$references" ]]; then
            if ! $update_needed; then
                echo -e "\n${YELLOW}Manual reference updates may be needed:${NC}"
                update_needed=true
            fi
            
            echo "$references" | while read -r ref_file; do
                if [[ -f "$ref_file" ]]; then
                    # Suggest replacement based on file type
                    local replacement=""
                    case "$deleted_file" in
                        API_TESTING_*) replacement="API_TESTING.md" ;;
                        ERROR_HANDLING_*) replacement="ERROR_HANDLING_TESTING.md" ;;
                        INTEGRATION_TESTING_*) replacement="INTEGRATION_TESTING.md" ;;
                        WORKER_TESTING_*) replacement="WORKER_TESTING.md" ;;
                        CROSS_PLATFORM_*) replacement="CROSS_PLATFORM_TESTING.md" ;;
                        AUDIO_INPUT_*) replacement="AUDIO_INPUT_TESTING.md" ;;
                        GENRE_TESTING_*) replacement="GENRE_TESTING.md" ;;
                        IMPLEMENTATION_SUMMARY*|ENHANCED_ALGORITHMS*) replacement="ARCHITECTURE.md" ;;
                    esac
                    
                    if [[ -n "$replacement" ]]; then
                        echo "  sed -i 's|$deleted_file|$replacement|g' '$ref_file'"
                    fi
                fi
            done
        fi
    done
    
    if ! $update_needed; then
        log_color "No reference updates needed" "$GREEN"
    fi
}

show_summary() {
    log_color "\n=== VERIFICATION SUMMARY ===" "$BLUE"
    
    echo "Required Files:"
    check_required_files >/dev/null 2>&1 && echo "  ✓ All present" || echo "  ✗ Some missing"
    
    echo "Deleted Files:"
    check_deleted_files >/dev/null 2>&1 && echo "  ✓ All removed" || echo "  ⚠ Some still present"
    
    echo "References:"
    check_broken_references >/dev/null 2>&1 && echo "  ✓ No broken references" || echo "  ⚠ Some references found"
    
    echo "Navigation:"
    verify_navigation_integrity >/dev/null 2>&1 && echo "  ✓ Navigation intact" || echo "  ⚠ Navigation issues"
    
    echo "Content:"
    verify_content_preservation >/dev/null 2>&1 && echo "  ✓ Content preserved" || echo "  ⚠ Content issues"
}

# Main execution
main() {
    log_color "Beat Parser Documentation Reference Verification" "$BLUE"
    echo "Checking documentation integrity after redundant file cleanup..."
    echo
    
    local total_issues=0
    
    # Run all checks
    check_required_files || ((total_issues++))
    check_deleted_files || ((total_issues++))
    check_broken_references || ((total_issues++))
    verify_navigation_integrity || ((total_issues++))
    verify_content_preservation || ((total_issues++))
    
    # Generate update suggestions if needed
    generate_update_commands
    
    # Show summary
    show_summary
    
    echo
    if [[ $total_issues -eq 0 ]]; then
        log_color "✅ ALL CHECKS PASSED - Documentation cleanup successful!" "$GREEN"
        exit 0
    else
        log_color "⚠️  $total_issues check(s) had issues - Review output above" "$YELLOW"
        exit 1
    fi
}

# Run main function
main "$@"