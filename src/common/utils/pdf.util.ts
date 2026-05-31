import PDFDocument from 'pdfkit';

export async function generateStockRecordPdf(record: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Brand Colors (Amber/Warm Theme)
      const primaryColor = '#d97706'; // Amber 600
      const accentColor = '#f59e0b'; // Amber 500
      const textColor = '#1f2937'; // Gray 800
      const secondaryTextColor = '#4b5563'; // Gray 600
      const borderGray = '#e5e7eb'; // Gray 200
      const tableHeaderBg = '#f9fafb'; // Gray 50

      // Header Bar Decoration
      doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

      // Brand Title
      doc.fillColor(primaryColor)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('SHAWARMA GUYS', 50, 40);

      doc.fillColor(secondaryTextColor)
        .font('Helvetica')
        .fontSize(8)
        .text('AUTOMATED INVENTORY AUDIT CONTROL SYSTEM', 50, 65);

      // Report Header Title
      doc.fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('Current Stock Sheet'.toUpperCase(), 50, 95, { align: 'right' });

      // Horizontal separator line
      doc.moveTo(50, 115)
        .lineTo(doc.page.width - 50, 115)
        .strokeColor(accentColor)
        .lineWidth(2)
        .stroke();

      // Metadata Block
      let y = 135;
      doc.fillColor(textColor).fontSize(10);

      // Left Column Metadata
      doc.font('Helvetica-Bold').text('Location:', 50, y);
      doc.font('Helvetica').text(record.location?.name || 'N/A', 140, y);

      // Right Column Metadata
      doc.font('Helvetica-Bold').text('Vendor Name:', 300, y);
      doc.font('Helvetica').text(record.vendorName || 'N/A', 400, y);

      y += 18;
      doc.font('Helvetica-Bold').text('Submitted By:', 50, y);
      doc.font('Helvetica').text(record.submitter?.fullName || 'System / Scheduler', 140, y);

      doc.font('Helvetica-Bold').text('Submitted At:', 300, y);
      doc.font('Helvetica').text(
        record.submittedAt ? new Date(record.submittedAt).toLocaleString() : 'N/A',
        400,
        y
      );

      y += 18;
      doc.font('Helvetica-Bold').text('Audit ID:', 50, y);
      doc.font('Helvetica').text(record.id || 'N/A', 140, y);

      const tableX = 50;
      const tableWidth = doc.page.width - 100;
      const tableRight = tableX + tableWidth;
      const columnDividers = [135, 300, 375, 450];
      const rowDividerXs = [tableX, ...columnDividers, tableRight];
      const formatQtyNumber = (value: number) => {
        const rounded = Math.round(value * 10) / 10;
        return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
      };
      const formatCount = (
        secondaryQuantity: number,
        basicQuantity: number,
        displayUnit: string,
        baseUnit: string,
        isSameUnit: boolean,
      ) => {
        if (isSameUnit) {
          return `${formatQtyNumber(secondaryQuantity + basicQuantity)} ${displayUnit}`;
        }

        return `${formatQtyNumber(secondaryQuantity)} ${displayUnit}\n+ ${formatQtyNumber(basicQuantity)} ${baseUnit}`;
      };
      const drawStockTableHeader = (headerY: number) => {
        doc.rect(tableX, headerY, tableWidth, 24).fill(tableHeaderBg);
        doc.rect(tableX, headerY, tableWidth, 24).strokeColor(borderGray).lineWidth(1).stroke();

        for (const dividerX of columnDividers) {
          doc.moveTo(dividerX, headerY)
            .lineTo(dividerX, headerY + 24)
            .strokeColor(borderGray)
            .lineWidth(0.5)
            .stroke();
        }

        doc.fillColor(textColor).font('Helvetica-Bold').fontSize(8);
        doc.text('Product Code', 60, headerY + 7, { width: 65 });
        doc.text('Item Name', 145, headerY + 7, { width: 145 });
        doc.text('BOH Qty', 305, headerY + 7, { width: 60, align: 'right' });
        doc.text('FOH Qty', 380, headerY + 7, { width: 60, align: 'right' });
        doc.text('Total Qty', 455, headerY + 7, { width: 95, align: 'right' });
      };

      // Table Border Header
      y += 30;
      drawStockTableHeader(y);

      y += 24;

      // Table Rows
      doc.font('Helvetica').fontSize(9);
      let isAltRow = false;

      for (const recordItem of record.items || []) {
        const item = recordItem.item || {};
        const displayUnit = item.displayUnitName || 'pcs';
        const baseUnit = item.baseUnitName || displayUnit;
        const isSameUnit = baseUnit.toLowerCase() === displayUnit.toLowerCase() || Number(item.multiplier) === 1;

        const code = item.productCode || 'N/A';
        const name = item.displayName || 'Unknown Item';

        const backSec = Number(recordItem.secondaryQuantity || 0);
        const backBasic = Number(recordItem.basicQuantity || 0);
        const frontSec = Number(recordItem.frontSecondaryQuantity || 0);
        const frontBasic = Number(recordItem.frontBasicQuantity || 0);

        const multiplier = Number(item.multiplier) || 1;
        const totalBasicUnits = (backSec * multiplier + backBasic) + (frontSec * multiplier + frontBasic);

        const totalSec = Math.floor(totalBasicUnits / multiplier);
        const totalBasic = totalBasicUnits - (totalSec * multiplier);

        const bohQty = formatCount(backSec, backBasic, displayUnit, baseUnit, isSameUnit);
        const fohQty = formatCount(frontSec, frontBasic, displayUnit, baseUnit, isSameUnit);
        const totalQty = isSameUnit
          ? `${formatQtyNumber(totalBasicUnits)} ${displayUnit}`
          : formatCount(totalSec, totalBasic, displayUnit, baseUnit, false);

        const nameHeight = doc.heightOfString(name, { width: 145 });
        const quantityHeight = doc.heightOfString(totalQty, { width: 95, align: 'right' });
        const rowHeight = Math.max(isSameUnit ? 24 : 38, nameHeight + 12, quantityHeight + 12);

        // Page breaking logic
        if (y + rowHeight > doc.page.height - 60) {
          doc.addPage();
          // Header Bar Decoration on next page
          doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

          y = 40;

          // Re-draw Table Header
          drawStockTableHeader(y);

          y += 24;
          doc.font('Helvetica').fontSize(9);
        }

        // Row background shading for readability
        if (isAltRow) {
          doc.rect(tableX, y, tableWidth, rowHeight).fill('#fafafa');
        }
        
        for (const dividerX of rowDividerXs) {
          doc.moveTo(dividerX, y)
            .lineTo(dividerX, y + rowHeight)
            .strokeColor(borderGray)
            .lineWidth(0.5)
            .stroke();
        }

        doc.fillColor(textColor).font('Helvetica').fontSize(8);
        doc.text(code, 60, y + 6, { width: 65 });
        doc.text(name, 145, y + 6, { width: 145 });
        doc.text(bohQty, 305, y + 6, { width: 60, align: 'right' });
        doc.text(fohQty, 380, y + 6, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').text(totalQty, 455, y + 6, { width: 95, align: 'right' });
        doc.font('Helvetica').fontSize(8);

        // Draw row bottom border line
        doc.moveTo(tableX, y + rowHeight)
          .lineTo(tableRight, y + rowHeight)
          .strokeColor(borderGray)
          .lineWidth(0.5)
          .stroke();

        y += rowHeight;
        isAltRow = !isAltRow;
      }

      // Audit footer disclaimer note
      y += 20;
      if (y > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);
        y = 40;
      }

      doc.fillColor('#9ca3af')
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(
          'This document serves as an immutable physical audit trail for store inventory validation.',
          50,
          y,
          { align: 'center', width: doc.page.width - 100 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generatePurchaseOrderPdf(po: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Brand Colors (Emerald/Green Theme for Orders)
      const primaryColor = '#10b981'; // Emerald 500
      const accentColor = '#34d399'; // Emerald 400
      const textColor = '#1f2937'; // Gray 800
      const secondaryTextColor = '#4b5563'; // Gray 600
      const borderGray = '#e5e7eb'; // Gray 200
      const tableHeaderBg = '#f9fafb'; // Gray 50

      // Header Bar Decoration
      doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

      // Brand Title
      doc.fillColor(primaryColor)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('SHAWARMA GUYS', 50, 40);

      doc.fillColor(secondaryTextColor)
        .font('Helvetica')
        .fontSize(8)
        .text('AUTOMATED INVENTORY AUDIT CONTROL SYSTEM', 50, 65);

      // Report Header Title
      doc.fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('OFFICIAL PURCHASE ORDER', 50, 95, { align: 'right' });

      // Horizontal separator line
      doc.moveTo(50, 115)
        .lineTo(doc.page.width - 50, 115)
        .strokeColor(accentColor)
        .lineWidth(2)
        .stroke();

      // Metadata Block
      let y = 135;
      doc.fillColor(textColor).fontSize(10);

      // Left Column Metadata
      doc.font('Helvetica-Bold').text('Location / Store:', 50, y);
      doc.font('Helvetica').text(po.location?.name || 'N/A', 150, y);

      // Right Column Metadata
      doc.font('Helvetica-Bold').text('Supplier / Vendor:', 300, y);
      doc.font('Helvetica').text(po.vendor?.displayName || 'N/A', 410, y);

      y += 18;
      doc.font('Helvetica-Bold').text('Created By:', 50, y);
      doc.font('Helvetica').text(po.creator?.fullName || 'System', 150, y);

      doc.font('Helvetica-Bold').text('Date Generated:', 300, y);
      doc.font('Helvetica').text(
        po.createdAt ? new Date(po.createdAt).toLocaleDateString() : 'N/A',
        410,
        y
      );

      y += 18;
      doc.font('Helvetica-Bold').text('Purchase Order ID:', 50, y);
      doc.font('Helvetica').text(po.id || 'N/A', 150, y);

      // Table Border Header
      y += 30;
      doc.rect(50, y, doc.page.width - 100, 24).fill(tableHeaderBg);
      doc.rect(50, y, doc.page.width - 100, 24).strokeColor(borderGray).lineWidth(1).stroke();

      // Table Column Titles
      doc.fillColor(textColor).font('Helvetica-Bold').fontSize(9);
      doc.text('Product Code', 60, y + 7, { width: 90 });
      doc.text('Item Name', 160, y + 7, { width: 220 });
      doc.text('Ordering Unit', 390, y + 7, { width: 90 });
      doc.text('Order Quantity', 490, y + 7, { width: 70, align: 'right' });

      y += 24;

      // Table Rows
      doc.font('Helvetica').fontSize(9);
      let isAltRow = false;

      for (const poItem of po.items || []) {
        // Page breaking logic
        if (y > doc.page.height - 80) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

          y = 40;

          doc.rect(50, y, doc.page.width - 100, 24).fill(tableHeaderBg);
          doc.rect(50, y, doc.page.width - 100, 24).strokeColor(borderGray).lineWidth(1).stroke();

          doc.fillColor(textColor).font('Helvetica-Bold').fontSize(9);
          doc.text('Product Code', 60, y + 7, { width: 90 });
          doc.text('Item Name', 160, y + 7, { width: 220 });
          doc.text('Ordering Unit', 390, y + 7, { width: 90 });
          doc.text('Order Quantity', 490, y + 7, { width: 70, align: 'right' });

          y += 24;
          doc.font('Helvetica').fontSize(9);
        }

        const item = poItem.item || {};
        const code = item.productCode || 'N/A';
        const name = item.displayName || 'Unknown Item';
        const unit = poItem.unitName || 'pcs';
        const quantity = Number(poItem.quantity || 0).toFixed(0);

        // Row background shading
        if (isAltRow) {
          doc.rect(50, y, doc.page.width - 100, 22).fill('#fafafa');
        }

        doc.fillColor(textColor);
        doc.text(code, 60, y + 6, { width: 90 });
        doc.text(name, 160, y + 6, { width: 220 });
        doc.text(unit, 390, y + 6, { width: 90 });
        doc.text(quantity, 490, y + 6, { width: 70, align: 'right' });

        // Draw row bottom border line
        doc.moveTo(50, y + 22)
          .lineTo(doc.page.width - 50, y + 22)
          .strokeColor(borderGray)
          .lineWidth(0.5)
          .stroke();

        y += 22;
        isAltRow = !isAltRow;
      }

      // Notes Section
      if (po.notes) {
        y += 20;
        if (y > doc.page.height - 100) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);
          y = 40;
        }

        doc.fillColor(textColor)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Notes / Dispatch Instructions:', 50, y);

        y += 14;
        doc.fillColor(secondaryTextColor)
          .font('Helvetica')
          .fontSize(9)
          .text(po.notes, 50, y, { width: doc.page.width - 100 });

        y += Math.ceil(doc.heightOfString(po.notes, { width: doc.page.width - 100 })) + 10;
      }

      // Footer
      y += 20;
      if (y > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);
        y = 40;
      }

      doc.fillColor('#9ca3af')
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(
          'This purchase order is generated electronically and represents an official ordering commitment.',
          50,
          y,
          { align: 'center', width: doc.page.width - 100 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
