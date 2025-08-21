// Scheduled Viral Content Scraper Lambda Function
import { runViralDiscoveryJob, scrapeViralFoodContent, monitorHashtagsForViral } from '../utils/viralContentScraper.js';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * SCHEDULED VIRAL CONTENT DISCOVERY
 * ================================
 * 
 * This Lambda function runs on a schedule (e.g., every 6 hours) to:
 * 1. Scrape viral food content from across the web
 * 2. Monitor trending hashtags
 * 3. Analyze viral patterns using AI
 * 4. Store discoveries for content inspiration
 * 5. Generate daily viral reports
 */

/**
 * Main Lambda handler for scheduled viral discovery
 */
export async function handler(event, context) {
    console.log('[ViralScheduler] Starting scheduled viral content discovery...');
    console.log('[ViralScheduler] Event:', JSON.stringify(event, null, 2));
    
    try {
        // Get search configuration from DynamoDB
        const searchConfig = await getSearchConfiguration();
        
        if (!searchConfig) {
            console.error('[ViralScheduler] Search configuration not found');
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: 'Search configuration not found'
                })
            };
        }
        
        // Run the comprehensive viral discovery job
        const report = await runViralDiscoveryJob(searchConfig);
        
        if (report) {
            console.log('[ViralScheduler] Viral discovery completed successfully:', {
                jobId: report.jobId,
                viralContentFound: report.viralContentFound,
                hashtagsMonitored: report.hashtagsMonitored
            });
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    report: {
                        jobId: report.jobId,
                        executedAt: report.executedAt,
                        viralContentFound: report.viralContentFound,
                        hashtagsMonitored: report.hashtagsMonitored,
                        topViralScore: report.topViralScore,
                        summary: report.summary
                    }
                })
            };
        } else {
            console.error('[ViralScheduler] Viral discovery job failed');
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: 'Viral discovery job failed'
                })
            };
        }
        
    } catch (error) {
        console.error('[ViralScheduler] Error in scheduled viral discovery:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message,
                stack: error.stack
            })
        };
    }
}

/**
 * Get search configuration from DynamoDB
 */
async function getSearchConfiguration() {
    try {
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        // Get configuration from the viral agency main config
        const response = await dynamodb.send(new GetItemCommand({
            TableName: 'SocialMediaConfig',
            Key: {
                configId: { S: 'agency_main_config' }
            }
        }));
        
        if (!response.Item) {
            console.warn('[ViralScheduler] No configuration found, using environment variables');
            
            // Fallback to environment variables
            return {
                googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY,
                googleSearchToken: process.env.GOOGLE_SEARCH_TOKEN,
                openAiApiKey: process.env.OPENAI_API_KEY
            };
        }
        
        const config = unmarshall(response.Item);
        
        return {
            googleSearchApiKey: config.googleSearchApiKey || process.env.GOOGLE_SEARCH_API_KEY,
            googleSearchToken: config.googleSearchToken || process.env.GOOGLE_SEARCH_TOKEN,
            openAiApiKey: config.openAiApiKey || process.env.OPENAI_API_KEY
        };
        
    } catch (error) {
        console.error('[ViralScheduler] Error getting search configuration:', error);
        
        // Fallback to environment variables
        return {
            googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY,
            googleSearchToken: process.env.GOOGLE_SEARCH_TOKEN,
            openAiApiKey: process.env.OPENAI_API_KEY
        };
    }
}

/**
 * Manual trigger for viral discovery (for testing)
 */
export async function manualTrigger(searchTerms = [], hashtags = []) {
    console.log('[ViralScheduler] Manual trigger for viral discovery');
    
    try {
        const searchConfig = await getSearchConfiguration();
        
        if (!searchConfig.googleSearchApiKey || !searchConfig.openAiApiKey) {
            throw new Error('Missing required API keys for viral discovery');
        }
        
        const results = {
            viralContent: [],
            hashtagMonitoring: [],
            timestamp: new Date().toISOString()
        };
        
        // 1. Scrape viral content if search terms provided
        if (searchTerms.length > 0) {
            console.log('[ViralScheduler] Manual scraping with custom search terms:', searchTerms);
            
            for (const term of searchTerms) {
                const content = await scrapeViralFoodContent({
                    ...searchConfig,
                    customSearchTerms: [term]
                });
                results.viralContent.push(...content);
            }
        }
        
        // 2. Monitor hashtags if provided
        if (hashtags.length > 0) {
            console.log('[ViralScheduler] Manual hashtag monitoring:', hashtags);
            
            const hashtagResults = await monitorHashtagsForViral(hashtags, searchConfig);
            results.hashtagMonitoring = hashtagResults;
        }
        
        // 3. Run full discovery if no specific terms/hashtags
        if (searchTerms.length === 0 && hashtags.length === 0) {
            console.log('[ViralScheduler] Running full viral discovery job');
            
            const fullReport = await runViralDiscoveryJob(searchConfig);
            results.fullReport = fullReport;
        }
        
        console.log('[ViralScheduler] Manual trigger completed:', {
            viralContentFound: results.viralContent.length,
            hashtagsMonitored: results.hashtagMonitoring.length
        });
        
        return {
            success: true,
            results
        };
        
    } catch (error) {
        console.error('[ViralScheduler] Error in manual trigger:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get viral inspiration for a specific deal (can be called from other functions)
 */
export async function getViralInspirationForDeal(dealData) {
    console.log('[ViralScheduler] Getting viral inspiration for deal:', dealData.dealId);
    
    try {
        const searchConfig = await getSearchConfiguration();
        
        // Import the inspiration function
        const { getViralInspiration } = await import('../utils/viralContentScraper.js');
        
        const inspiration = await getViralInspiration(dealData, searchConfig);
        
        console.log('[ViralScheduler] Viral inspiration gathered:', {
            dealId: dealData.dealId,
            inspirationCount: inspiration.inspirationContent.length,
            recommendationsCount: inspiration.recommendations.length
        });
        
        return {
            success: true,
            inspiration
        };
        
    } catch (error) {
        console.error('[ViralScheduler] Error getting viral inspiration:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Health check for the viral scraper scheduler
 */
export async function healthCheck() {
    try {
        const searchConfig = await getSearchConfiguration();
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            configuration: {
                googleSearchApiKey: !!searchConfig.googleSearchApiKey,
                googleSearchToken: !!searchConfig.googleSearchToken,
                openAiApiKey: !!searchConfig.openAiApiKey
            },
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };
        
        console.log('[ViralScheduler] Health check completed:', health);
        
        return {
            statusCode: 200,
            body: JSON.stringify(health)
        };
        
    } catch (error) {
        console.error('[ViralScheduler] Health check failed:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
}


