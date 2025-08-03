// src/utils/pdfUtils.js
import PDFDocument from 'pdfkit';

/**
 * Generates an invoice PDF and returns it as a Buffer.
 * @param {object} order - The order object from DynamoDB.
 * @param {object} botConfig - The bot/store configuration object.
 * @param {string} customerNameToUse - The name of the customer for the invoice.
 * @returns {Promise<Buffer>} A promise that resolves with the PDF buffer.
 */
async function generateInvoicePdfBuffer(order, botConfig = {}, customerNameToUse) { // 'order' is expected to be FastAPI order object
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', (err) => {
        console.error('[PDFUtils] Error during PDF generation:', err);
        reject(err);
      });

      // --- Invoice Header ---
      doc.fontSize(20).text(botConfig.storeName || 'Invoice', { align: 'center' });
      doc.moveDown();

      if (botConfig.storeAddress) {
        doc.fontSize(10).text(botConfig.storeAddress, { align: 'left' });
      }
      if (botConfig.storeContactNumber) {
        doc.fontSize(10).text(`Phone: ${botConfig.storeContactNumber}`, { align: 'left' });
      }
      if (botConfig.storeEmail) {
        doc.fontSize(10).text(`Email: ${botConfig.storeEmail}`, { align: 'left' });
      }
      doc.moveDown(0.5);

      doc.fontSize(10).text(`Store ID: ${order.store_id}`, { continued: true }); // FastAPI: store_id
      doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.text(`Order ID: ${order.id}`, { continued: true }); // FastAPI: id (for order_id)
      doc.text(`Order Date: ${new Date(order.created_at).toLocaleDateString()}`, { align: 'right' }); // FastAPI: created_at
      doc.moveDown(2);

      // --- Customer Information ---
      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10).text(customerNameToUse || order.customer_details?.name || order.customer_id); // FastAPI: customer_id, customer_details.name
      // The old structure had customerInfo.address, etc. We'll simplify for now.
      // doc.text(orderDetails.customerInfo.address);
      // if (orderDetails.customerInfo.phone) {
      //   doc.text(`Phone: ${orderDetails.customerInfo.phone}`);
      // }
      doc.text(`WhatsApp: ${order.customer_id}`); // FastAPI: customer_id is the WhatsApp number
      doc.moveDown(2);

      // --- Items Table Header ---
      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Item', 50, tableTop, { width: 200, continued: true, bold: true });
      doc.text('Qty', 250, tableTop, { width: 50, align: 'right', continued: true, bold: true });
      doc.text('Price', 300, tableTop, { width: 100, align: 'right', continued: true, bold: true });
      doc.text('Total', 0, tableTop, { align: 'right', bold: true }); 
      doc.moveDown();

      // --- Items Table Rows ---
      let subtotal = 0;
      
      // Log order data for debugging
      console.log('[PDFUtils] Order data for PDF generation:', JSON.stringify(order));
      
      // Check if order_lines exists and is not empty
      if (!order.order_lines || order.order_lines.length === 0) {
        console.warn('[PDFUtils] No order_lines found in order data, falling back to products array if available');
      }
      
      // Use order_lines if available, or fall back to products array if it exists
      const lineItems = (order.order_lines && order.order_lines.length > 0) ? 
                        order.order_lines : 
                        (order.products || []);
      
      console.log(`[PDFUtils] Found ${lineItems.length} line items for order ${order.id || 'unknown'}`);
      
      lineItems.forEach(item => {
        const itemY = doc.y;
        const productName = item.product_name || item.name || item.product_id || 'Product';
        const quantity = item.quantity || 1;
        const pricePerUnit = item.price_per_unit || item.price || 0;
        const lineTotal = item.line_total || (quantity * pricePerUnit) || 0;
        
        // Add product details to PDF
        doc.text(productName, 50, itemY, { width: 200 });
        doc.text(quantity.toString(), 250, itemY, { width: 50, align: 'right' });
        doc.text(pricePerUnit.toFixed(2), 300, itemY, { width: 100, align: 'right' });
        doc.text(lineTotal.toFixed(2), 0, itemY, { align: 'right' });
        
        // Track running total
        subtotal += lineTotal;
        doc.moveDown(0.5);
        
        console.log(`[PDFUtils] Added line item: ${productName}, qty: ${quantity}, price: ${pricePerUnit}, total: ${lineTotal}`);
      });
      doc.moveDown();

      // --- Totals ---
      const currencySymbol = order.currency_code || ''; // FastAPI: currency_code
      const totalsTop = doc.y;
      doc.text('Subtotal:', 300, totalsTop, { width: 100, align: 'right', continued: true });
      doc.text(`${currencySymbol} ${subtotal.toFixed(2)}`, 0, totalsTop, { align: 'right' });
      doc.moveDown(0.5);
      // Add Tax, Shipping if applicable
      // For now, assume order.totalAmount is the final amount
      doc.font('Helvetica-Bold').text('Total Amount:', 300, doc.y, { width: 100, align: 'right', continued: true });
      doc.text(`${currencySymbol} ${(order.total_amount || 0).toFixed(2)}`, 0, doc.y, { align: 'right' }); // FastAPI: total_amount
      doc.moveDown(2);

      // --- Footer ---
      if (botConfig.paymentInstructions) {
        doc.fontSize(8).text(botConfig.paymentInstructions, { align: 'center' });
        doc.moveDown(0.5);
      }
      doc.fontSize(8).text(botConfig.invoiceFooterText || 'Thank you for your business!', { align: 'center' });
      if (botConfig.storeWebsite) {
        doc.fontSize(8).text(botConfig.storeWebsite, { align: 'center', link: botConfig.storeWebsite, underline: true });
      }

      doc.end();
    } catch (error) {
      console.error('[PDFUtils] Failed to generate PDF buffer:', error);
      reject(error);
    }
  });
}

export {
  generateInvoicePdfBuffer,
};
