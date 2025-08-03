import axios from 'axios';
import { sendWhatsAppMessage } from './whatsappUtils.js';

/**
 * Format invoice data for WhatsApp display
 * @param {Object} invoiceData - The invoice data from the API
 * @param {string} orderId - The order ID
 * @returns {string} - Formatted invoice text
 */
export function formatInvoiceDataForWhatsapp(invoiceData, orderId) {
  // Handle case where invoiceData might be nested in a response
  const data = invoiceData.invoice_data || invoiceData;
  
  // Start with header
  let invoiceText = `*INVOICE #${orderId || data.order_id || 'N/A'}*\n\n`;
  
  // Add date
  if (data.created_at || data.date) {
    const dateStr = data.created_at || data.date;
    const date = new Date(dateStr);
    invoiceText += `Date: ${date.toLocaleDateString()}\n`;
  }
  
  // Add customer info
  if (data.customer_name) {
    invoiceText += `Customer: ${data.customer_name}\n`;
  }
  
  invoiceText += `\n*ITEMS*\n`;
  
  // Add items
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item, index) => {
      invoiceText += `${index+1}. ${item.name || 'Item'} `;
      if (item.quantity) {
        invoiceText += `(x${item.quantity}) `;
      }
      if (item.price || item.unit_price) {
        const price = item.price || item.unit_price;
        invoiceText += `$${price.toFixed(2)} `;
      }
      if (item.total) {
        invoiceText += `= $${item.total.toFixed(2)}`;
      }
      invoiceText += `\n`;
    });
  }
  
  invoiceText += `\n*SUMMARY*\n`;
  
  // Add subtotal
  if (data.subtotal) {
    invoiceText += `Subtotal: $${Number(data.subtotal).toFixed(2)}\n`;
  }
  
  // Add tax if present
  if (data.tax) {
    invoiceText += `Tax: $${Number(data.tax).toFixed(2)}\n`;
  }
  
  // Add total
  if (data.total || data.total_amount) {
    const total = data.total || data.total_amount;
    invoiceText += `*TOTAL: $${Number(total).toFixed(2)}*\n`;
  }
  
  // Add payment status
  if (data.payment_status) {
    invoiceText += `\nPayment Status: ${data.payment_status}\n`;
  }
  
  // Add footer with link if available
  if (data.invoice_url || data.invoice_pdf_url) {
    const url = data.invoice_url || data.invoice_pdf_url;
    invoiceText += `\nView full invoice: ${url}\n`;
  }
  
  return invoiceText;
}

/**
 * Fetches invoice details for an order and sends it to the customer via WhatsApp
 * @param {string} storeId - The store ID
 * @param {string} customerWhatsappNumber - Customer's WhatsApp number
 * @param {string} orderId - Order ID to fetch invoice for
 * @param {Object} botConfig - Bot configuration containing API endpoints
 * @returns {Object} - Result object with toolResponse
 */
export async function executeGetInvoice(storeId, customerWhatsappNumber, orderId, botConfig) {
  console.log(`[storeId: ${storeId}] executeGetInvoice called for customer ${customerWhatsappNumber}, order ${orderId}.`);
  try {
    // Get the base URL from botConfig or environment variable
    const baseUrl = botConfig.posFastapiBaseUrl || process.env.POS_FASTAPI_BASE_URL;
    if (!baseUrl) {
      console.error(`[storeId: ${storeId}] No POS FastAPI base URL configured for invoice fetching.`);
      await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: "I'm sorry, I cannot fetch your invoice at this time due to a configuration issue. Please try again later." } }, botConfig);
      return { toolResponse: `No POS API URL configured for invoice fetch.` };
    }

    console.log(`[storeId: ${storeId}] Fetching invoice details for order ${orderId} from FastAPI: ${baseUrl}`);
    const invoiceUrl = `${baseUrl}/stores/${storeId}/orders/${orderId}/invoice-details`;
    const response = await axios.get(invoiceUrl);
    console.log(`[storeId: ${storeId}] Got invoice API response:`, response.data);

    if (response.data && response.data.invoice_data) {
      // Format the invoice data for WhatsApp message
      const formattedInvoice = formatInvoiceDataForWhatsapp(response.data.invoice_data, orderId);
      
      // Send the formatted invoice to the customer via WhatsApp
      await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: formattedInvoice } }, botConfig);
      return { toolResponse: `Invoice for order ${orderId} sent to customer.` };
    } else {
      // No invoice data found
      console.warn(`[storeId: ${storeId}] No invoice data found in response for order ${orderId}.`);
      await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: `I couldn't find an invoice for order #${orderId}. Please contact customer support if you need assistance.` } }, botConfig);
      return { toolResponse: `No invoice data found for order ${orderId}.` };
    }
  } catch (error) {
    console.error(`[storeId: ${storeId}] Error fetching invoice details from FastAPI for order ${orderId}:`, error.response ? error.response.data : error.message);
    let userMessage = "Sorry, I encountered an error while fetching your invoice.";
    if (error.response && error.response.status === 404) {
        userMessage = `Sorry, I couldn't find an invoice for order ID ${orderId}. Please check the ID and try again.`;
    }
    await sendWhatsAppMessage(storeId, customerWhatsappNumber, { type: 'text', text: { body: userMessage } }, botConfig);
    return { toolResponse: `Error fetching invoice for order ${orderId}.` };
  }
}
