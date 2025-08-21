// N8N Posting Status Callback API Route
import { handleN8NPostingStatus } from '../../../utils/n8nIntegration.js';

/**
 * POST /api/n8n/status
 * Handle posting status updates from N8N social media pipeline
 */
export async function POST(request) {
    try {
        console.log('[API] Received N8N posting status callback');
        
        const statusData = await request.json();
        
        // Validate required fields
        if (!statusData.dealId || !statusData.status) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: dealId, status'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Process the status update
        const result = await handleN8NPostingStatus(statusData);
        
        if (result.success) {
            return new Response(JSON.stringify({
                success: true,
                message: 'Posting status processed successfully',
                dealId: statusData.dealId,
                status: result.status
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
        console.error('[API] Error processing N8N status update:', error);
        
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error processing status update'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * GET /api/n8n/status
 * Health check for N8N status webhook
 */
export async function GET() {
    return new Response(JSON.stringify({
        success: true,
        message: 'N8N Posting Status API is running',
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}


