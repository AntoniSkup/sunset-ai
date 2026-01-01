# Quickstart Guide: Landing Page Code Generation Tool

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool

## Overview

This guide provides step-by-step instructions for testing and using the landing page code generation tool. It covers the primary user flows and test scenarios.

## Prerequisites

- User account authenticated and logged in
- Chat interface accessible
- Preview panel visible on right side
- Database configured and migrations run

## User Flow 1: Create New Landing Page

### Steps

1. **Open Chat Interface**
   - Navigate to builder page
   - Chat interface visible on left side

2. **Send Creation Request**
   - Type message: "Create a landing page for a coffee shop"
   - Submit message

3. **Observe Code Generation**
   - Chat shows "Generating code..." indicator
   - Input field disabled during generation
   - Wait for generation to complete (target: <30 seconds)

4. **Verify Success**
   - Chat shows confirmation: "Landing page generated successfully (v1)"
   - Preview panel updates to show generated landing page
   - Landing page renders with Tailwind CSS styling

5. **Verify Database**
   - Check database: `landing_page_versions` table has new record
   - Version number is 1
   - Code content stored correctly

### Expected Results

- ✅ Code generation completes within 30 seconds
- ✅ Preview panel updates within 2 seconds of completion
- ✅ Generated code renders correctly in preview
- ✅ Database record created with correct version number
- ✅ User receives confirmation message

## User Flow 2: Iterative Refinement

### Steps

1. **Start with Existing Landing Page**
   - Complete User Flow 1 to create initial landing page

2. **Request Modification**
   - Type message: "Change the background color to blue"
   - Submit message

3. **Observe Update**
   - Chat shows generation indicator
   - Code generation processes modification request
   - Previous code preserved, only requested changes applied

4. **Verify Update**
   - Chat shows confirmation: "Landing page updated (v2)"
   - Preview panel updates to show modified version
   - Background color changed to blue
   - Other elements unchanged

5. **Verify Version History**
   - Check database: Two records for same session_id
   - Version numbers: 1 and 2
   - v2 is most recent version

### Expected Results

- ✅ Modification completes within 30 seconds
- ✅ Previous code structure preserved
- ✅ Only requested changes applied
- ✅ New version created (v2)
- ✅ Preview updates correctly

## User Flow 3: Error Handling - Generation Failure

### Steps

1. **Trigger Generation Failure**
   - Simulate AI service timeout or error
   - Send landing page creation request

2. **Observe Error Handling**
   - Chat shows error message: "Code generation failed. Please try again."
   - Retry button appears in chat
   - No code saved to database

3. **Retry Request**
   - Click retry button
   - Generation attempts again
   - On success, proceeds normally

### Expected Results

- ✅ Error message displayed clearly
- ✅ Retry option available
- ✅ No partial code saved
- ✅ Retry works correctly

## User Flow 4: Error Handling - Save Failure

### Steps

1. **Trigger Save Failure**
   - Generate code successfully
   - Simulate database connection error during save

2. **Observe Error Handling**
   - Chat shows error: "Failed to save code. Retry?"
   - Generated code kept in memory
   - Retry button available

3. **Retry Save**
   - Click retry button
   - Save operation retries
   - On success, code saved and preview updated

### Expected Results

- ✅ Error message displayed
- ✅ Code preserved in memory
- ✅ Retry saves successfully
- ✅ Preview updates after successful save

## User Flow 5: Concurrent Request Handling

### Steps

1. **Send First Request**
   - Send: "Create a landing page for a restaurant"
   - Generation starts

2. **Send Second Request While First Processing**
   - Immediately send: "Make it dark themed"
   - Observe behavior

3. **Verify Queue Behavior**
   - Second request queued
   - First request completes first
   - Second request processes after first completes
   - Both versions saved sequentially

### Expected Results

- ✅ Second request queued (not processed immediately)
- ✅ Requests processed sequentially
- ✅ Both versions saved correctly
- ✅ Version numbers sequential (v1, v2)

## User Flow 6: Code Validation and Error Fixing

### Steps

1. **Generate Code with Errors**
   - AI generates code with unclosed tags or syntax errors
   - System detects errors

2. **Observe Error Fixing**
   - System automatically fixes common errors
   - Code validated before save
   - Fixes logged (if applicable)

3. **Verify Fixed Code**
   - Saved code is valid HTML
   - Preview renders correctly
   - No manual fixes needed

### Expected Results

- ✅ Common errors automatically fixed
- ✅ Valid code saved to database
- ✅ Preview renders without errors
- ✅ User doesn't see error messages (handled transparently)

## Test Scenarios

### Scenario 1: Empty Request

**Input**: Empty message or whitespace only  
**Expected**: Chat shows error, no tool invocation

### Scenario 2: Vague Request

**Input**: "Make a website"  
**Expected**: Tool invoked, generates generic landing page

### Scenario 3: Conflicting Requirements

**Input**: "Make it dark and light"  
**Expected**: Tool invoked, AI resolves conflict (may choose one or ask for clarification)

### Scenario 4: Very Long Request

**Input**: Long description (1000+ words)  
**Expected**: Tool invoked, handles long prompt, generates code

### Scenario 5: Special Characters

**Input**: Request with special characters, emojis, etc.  
**Expected**: Tool invoked, handles special characters correctly

### Scenario 6: Multiple Sessions

**Input**: User has multiple browser tabs/sessions  
**Expected**: Each session has independent version numbering

## Performance Benchmarks

### Target Metrics

- Code generation: <30 seconds (SC-001)
- Preview update: <2 seconds after save (SC-004)
- Success rate: 95% (SC-003)
- Code rendering: 90% render correctly (SC-002)

### Measurement

- Use browser DevTools Network tab for timing
- Check database query execution time
- Monitor AI service response time
- Test with various code sizes (small to 1MB)

## Debugging

### Check Tool Invocation

- Verify tool appears in chat API route `tools` array
- Check AI model logs for tool invocation
- Verify tool parameters passed correctly

### Check Code Generation

- Review AI service logs
- Check generated code quality
- Verify prompt construction

### Check Database

- Query `landing_page_versions` table
- Verify version numbers sequential
- Check code content stored correctly

### Check Preview

- Inspect postMessage communication
- Verify iframe src updates
- Check browser console for errors

## Common Issues

### Issue: Tool Not Invoked

**Symptoms**: User request doesn't trigger code generation  
**Debug**: Check tool description, verify AI model detects intent  
**Fix**: Improve tool description or add examples to prompt

### Issue: Code Not Saving

**Symptoms**: Generation succeeds but no database record  
**Debug**: Check database connection, verify save function  
**Fix**: Check error logs, verify database permissions

### Issue: Preview Not Updating

**Symptoms**: Code saved but preview doesn't change  
**Debug**: Check postMessage communication, verify iframe  
**Fix**: Verify postMessage listener, check iframe src

### Issue: Version Numbers Not Sequential

**Symptoms**: Version numbers skip or duplicate  
**Debug**: Check version number calculation logic  
**Fix**: Verify MAX query, ensure atomic operations

## Next Steps

After completing quickstart:

1. Review generated code quality
2. Test edge cases and error scenarios
3. Verify performance meets success criteria
4. Test with real user scenarios
5. Monitor error rates and retry success
