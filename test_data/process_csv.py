import pandas as pd
import os

input_file = 'input.csv'
output_file = 'output.txt'

print(f"Current working directory: {os.getcwd()}")
print(f"Looking for input file: {input_file}")

try:
    # Check if input file exists
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found in {os.getcwd()}")
        # List directory contents for debugging
        print("Directory contents:")
        for item in os.listdir('.'):
            print(f"- {item}")
        exit(1)

    # Read the CSV file
    df = pd.read_csv(input_file)
    print(f"Successfully read {input_file}")

    # Calculate the sum of the 'value' column
    total_sum = df['value'].sum()
    print(f"Calculated sum: {total_sum}")

    # Write the sum to the output file
    with open(output_file, 'w') as f:
        f.write(f"Total sum: {total_sum}\n")
    print(f"Successfully wrote result to {output_file}")

except Exception as e:
    print(f"An error occurred: {e}")
    exit(1) 