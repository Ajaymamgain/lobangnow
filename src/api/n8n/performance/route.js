// N8N Performance Update Callback API Route
import { handleN8NPerformanceUpdate } from '../../../utils/n8nIntegration.js';

/**
 * POST /api/n8n/performance
 * Handle performance updates from N8N social media pipeline
 */
export async function POST(request) {
    try {
        console.log('[API] Received N8N performance update callback');
        
        const updateData = await request.json();
        
        // Validate required fields
        if (!updateData.dealId || !updateData.metrics) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: dealId, metrics'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Process the performance update
        const result = await handleN8NPerformanceUpdate(updateData);
        
        if (result.success) {
            return new Response(JSON.stringify({
                success: true,
                message: 'Performance update processed successfully',
                dealId: updateData.dealId,
                commission: result.commission
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({
                success: false,
                error: result.error
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
    } catch (error) {
        console.error('[API] Error processing N8N performance update:', error);
        
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error processing performance update'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * GET /api/n8n/performance
 * Health check for N8N performance webhook
 */
export async function GET() {
    return new Response(JSON.stringify({
        success: true,
        message: 'N8N Performance Update API is running',
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}


