// Script to upload Singapore postal code database to DynamoDB
import { DynamoDBClient, CreateTableCommand, PutItemCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const tableName = 'store-ai-bot-dev-postal-codes';

// Function to create the postal codes table
async function createPostalCodesTable() {
    const createTableParams = {
        TableName: tableName,
        KeySchema: [
            {
                AttributeName: 'postal',
                KeyType: 'HASH' // Partition key
            }
        ],
        AttributeDefinitions: [
            {
                AttributeName: 'postal',
                AttributeType: 'S'
            }
        ],
        BillingMode: 'PAY_PER_REQUEST', // On-demand billing
        Tags: [
            {
                Key: 'Environment',
                Value: 'dev'
            },
            {
                Key: 'Purpose',
                Value: 'Singapore postal code lookup'
            }
        ]
    };

    try {
        console.log(`Creating table ${tableName}...`);
        await dynamoClient.send(new CreateTableCommand(createTableParams));
        console.log(`Table ${tableName} created successfully!`);
        
        // Wait for table to be active
        let tableStatus = 'CREATING';
        while (tableStatus !== 'ACTIVE') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const describeResult = await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
            tableStatus = describeResult.Table.TableStatus;
            console.log(`Table status: ${tableStatus}`);
        }
        
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log(`Table ${tableName} already exists.`);
        } else {
            console.error('Error creating table:', error);
            throw error;
        }
    }
}

// Function to parse CSV data
function parseCSV(csvContent) {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line handling quoted values
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        if (values.length === headers.length) {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = values[index];
            });
            data.push(record);
        }
    }
    
    return data;
}

// Function to upload postal code data to DynamoDB
async function uploadPostalCodes() {
    try {
        // Read the CSV file
        const csvPath = path.join(__dirname, '../../database.csv');
        console.log(`Reading CSV file from: ${csvPath}`);
        
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const postalData = parseCSV(csvContent);
        
        console.log(`Parsed ${postalData.length} postal code records`);
        
        // Upload data in batches
        const batchSize = 25; // DynamoDB batch write limit
        let uploadedCount = 0;
        
        for (let i = 0; i < postalData.length; i += batchSize) {
            const batch = postalData.slice(i, i + batchSize);
            
            // Upload each item in the batch
            const uploadPromises = batch.map(async (record) => {
                // Clean and format the data
                const item = {
                    postal: record.POSTAL || '',
                    address: record.ADDRESS || '',
                    blkNo: record.BLK_NO || '',
                    building: record.BUILDING || '',
                    roadName: record.ROAD_NAME || '',
                    latitude: parseFloat(record.LATITUDE) || 0,
                    longitude: parseFloat(record.LONGITUDE) || 0,
                    x: parseFloat(record.X) || 0,
                    y: parseFloat(record.Y) || 0,
                    createdAt: new Date().toISOString()
                };
                
                // Only upload if postal code exists
                if (item.postal && item.postal.length === 5) {
                    const putParams = {
                        TableName: tableName,
                        Item: marshall(item)
                    };
                    
                    await dynamoClient.send(new PutItemCommand(putParams));
                    return true;
                }
                return false;
            });
            
            const results = await Promise.all(uploadPromises);
            const successCount = results.filter(r => r).length;
            uploadedCount += successCount;
            
            console.log(`Uploaded batch ${Math.floor(i / batchSize) + 1}: ${successCount} items (Total: ${uploadedCount})`);
            
            // Small delay to avoid throttling
            if (i + batchSize < postalData.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`Successfully uploaded ${uploadedCount} postal code records to ${tableName}`);
        
    } catch (error) {
        console.error('Error uploading postal codes:', error);
        throw error;
    }
}

// Main execution
async function main() {
    try {
        console.log('Starting Singapore postal code database upload...');
        
        // Create table if it doesn't exist
        await createPostalCodesTable();
        
        // Upload postal code data
        await uploadPostalCodes();
        
        console.log('Postal code database upload completed successfully!');
        
    } catch (error) {
        console.error('Upload failed:', error);
        process.exit(1);
    }
}

// Run the script
main();
