import pandas as pd
import os

# Simple script to process a CSV file
print(f"Current working directory: {os.getcwd()}")

# Check for input file
if not os.path.exists('input.csv'):
    print("Error: input.csv not found")
    print("Files in directory:")
    for f in os.listdir('.'):
        print(f"- {f}")
    exit(1)

# Read the CSV file
df = pd.read_csv('input.csv')
print("Successfully read input.csv")

# Calculate sum
total = df['value'].sum()
print(f"Total sum: {total}")

# Write result to output file
with open('output.txt', 'w') as f:
    # Use separate prints to avoid \n escape sequence issues
    f.write(f"Total sum of values: {total}")
    f.write("\n")  # Add newline as separate write
print("Output written to output.txt") 