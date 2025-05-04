import pandas as pd
import os
import glob

# Script to process data files uploaded via data_urls
print(f"Current working directory: {os.getcwd()}")

# In the container, data files are mounted in /data directory
print("Listing contents of /data directory:")
data_files = glob.glob("/data/*")
if not data_files:
    print("No files found in /data directory")
    print("Listing current directory instead:")
    for f in os.listdir('.'):
        print(f"- {f}")
    exit(1)

print("Available data files:")
for f in data_files:
    print(f"- {f}")

# Use the first CSV file found
input_file = next((f for f in data_files if f.endswith('.csv')), None)

if not input_file:
    print("Error: No CSV file found in data directory")
    exit(1)

print(f"Using input file: {input_file}")

# Read the CSV file
df = pd.read_csv(input_file)
print(f"Successfully read {input_file}")
print(f"Data preview:\n{df.head()}")

# Calculate sum
total = df['value'].sum()
print(f"Total sum: {total}")

# Write result to output file
with open('output.txt', 'w') as f:
    f.write(f"Data URL Test Result\n")
    f.write(f"Input file: {input_file}\n")
    f.write(f"Total sum of values: {total}\n")
    f.write(f"Number of rows: {len(df)}\n")

print("Output written to output.txt") 