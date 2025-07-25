#!/bin/bash

# Script to update all record titles with sequential numbering
# Usage: ./update_record_titles.sh

TOKEN="bd6da8303cbe15a6c08229e5172a62d7b676cf45edb9327152a4cfd4b3c33653"
API_BASE="http://localhost:3000/api"

echo "Fetching all records..."

# Get all records
RECORDS_RESPONSE=$(curl -s "$API_BASE/records?offset=0&limit=100" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json")

# Extract records using jq
RECORDS=$(echo "$RECORDS_RESPONSE" | jq -r '.data.records[] | @base64')

counter=1

echo "Updating record titles with sequential numbering..."

echo "$RECORDS" | while IFS= read -r record_base64; do
  if [ -n "$record_base64" ]; then
    # Decode the record
    record_json=$(echo "$record_base64" | base64 -d)
    
    # Extract record details
    record_id=$(echo "$record_json" | jq -r '.id')
    current_title=$(echo "$record_json" | jq -r '.title')
    record_type=$(echo "$record_json" | jq -r '.type')
    record_content=$(echo "$record_json" | jq -r '.content')
    
    # Create new title with sequential number
    new_title=$(printf "%03d - %s" $counter "$current_title")
    
    echo "Updating record $record_id: '$current_title' -> '$new_title'"
    
    # Update the record via API
    update_response=$(curl -s -X PUT "$API_BASE/records/$record_id" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"title\": \"$new_title\",
        \"content\": \"$record_content\",
        \"type\": \"$record_type\"
      }")
    
    # Check if update was successful
    if echo "$update_response" | jq -e '.success' > /dev/null; then
      echo "✅ Successfully updated record $record_id"
    else
      echo "❌ Failed to update record $record_id"
      echo "Response: $update_response"
    fi
    
    counter=$((counter + 1))
  fi
done

echo "Finished updating $((counter - 1)) records with sequential numbering." 