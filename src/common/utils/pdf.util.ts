import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const getLogoPath = () => {
  const cwdPath = path.resolve(process.cwd(), 'sgnewlogo.png');
  if (fs.existsSync(cwdPath)) return cwdPath;
  const relativePath = path.resolve(__dirname, '../../..', 'sgnewlogo.png');
  if (fs.existsSync(relativePath)) return relativePath;
  return '';
};

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
      doc.font('Helvetica').text(record.submittedByName || record.submittedBy || 'System / Scheduler', 140, y);

      doc.font('Helvetica-Bold').text('Submitted At:', 300, y);
      doc.font('Helvetica').text(
        record.submittedAt ? new Date(record.submittedAt).toLocaleString() : 'N/A',
        400,
        y
      );

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
      doc.font('Helvetica').fontSize(8);
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
        const rowHeight = Math.max(isSameUnit ? 18 : 28, nameHeight + 6, quantityHeight + 6);

        // Page breaking logic
        if (y + rowHeight > doc.page.height - 60) {
          doc.addPage();
          // Header Bar Decoration on next page
          doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

          y = 40;

          // Re-draw Table Header
          drawStockTableHeader(y);

          y += 24;
          doc.font('Helvetica').fontSize(8);
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
        const textOffset = 4;
        doc.text(code, 60, y + textOffset, { width: 65 });
        doc.text(name, 145, y + textOffset, { width: 145 });
        doc.text(bohQty, 305, y + textOffset, { width: 60, align: 'right' });
        doc.text(fohQty, 380, y + textOffset, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').text(totalQty, 455, y + textOffset, { width: 95, align: 'right' });
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

      // Audit footer details
      y += 20;
      if (y > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);
        y = 40;
      }

      doc.fillColor('#9ca3af')
        .font('Helvetica')
        .fontSize(7)
        .text(`Audit ID: ${record.id || 'N/A'}`, 50, y, { align: 'center', width: doc.page.width - 100 });

      y += 12;

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

      // Brand Colors (Red Theme for Orders)
      const primaryColor = '#C0212F'; // Red
      const accentColor = '#E03E4B'; // Accent Red
      const textColor = '#1f2937'; // Gray 800
      const secondaryTextColor = '#4b5563'; // Gray 600
      const borderGray = '#e5e7eb'; // Gray 200
      const tableHeaderBg = '#f9fafb'; // Gray 50

      // Header Bar Decoration
      doc.rect(0, 0, doc.page.width, 15).fill(primaryColor);

      // Brand Title & Logo
      const logoPath = getLogoPath();
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 25, { height: 50 });
      } else {
        const logoX = 50;
        const logoY = 35;
        const logoSize = 34;
        // Draw background rounded square (emerald color)
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 8).fill(primaryColor);
        // Draw text "SG" in white inside the square
        doc.fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(14)
          .text('SG', logoX, logoY + 10, { width: logoSize, align: 'center' });
      }
      doc.fillColor(primaryColor)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('SHAWARMA GUYS', 115, 36);

      doc.fillColor(secondaryTextColor)
        .font('Helvetica')
        .fontSize(8)
        .text('AUTOMATED INVENTORY AUDIT CONTROL SYSTEM', 115, 58);

      // Report Header Title
      doc.fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('PURCHASE ORDER', 50, 95, { align: 'right' });

      // Horizontal separator line
      doc.moveTo(50, 115)
        .lineTo(doc.page.width - 50, 115)
        .strokeColor(accentColor)
        .lineWidth(2)
        .stroke();

      // Two-column layout for detailed Location and Vendor info
      let y = 135;
      doc.fillColor(textColor).fontSize(9);

      // Column Titles
      doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor);
      doc.text('FROM:', 50, y);
      doc.text('TO:', 310, y);

      y += 16;
      doc.fillColor(textColor).fontSize(9);

      // Left Column (Location) details
      let leftY = y;
      doc.font('Helvetica-Bold').text(po.location?.name || 'Shawarma Guys Store', 50, leftY);
      leftY += 13;
      doc.font('Helvetica');
      if (po.location?.address) {
        doc.text(po.location.address, 50, leftY, { width: 240 });
        leftY += doc.heightOfString(po.location.address, { width: 240 }) + 2;
      }
      if (po.location?.phone) {
        doc.text(`Phone: ${po.location.phone}`, 50, leftY);
        leftY += 13;
      }
      if (po.location?.email) {
        doc.text(`Email: ${po.location.email}`, 50, leftY);
        leftY += 13;
      }

      // Right Column (Vendor) details
      let rightY = y;
      doc.font('Helvetica-Bold').text(po.vendor?.displayName || 'Supplier', 310, rightY);
      rightY += 13;
      doc.font('Helvetica');
      const vendorAddressParts = [po.vendor?.address1, po.vendor?.address2, po.vendor?.address3].filter(Boolean);
      if (vendorAddressParts.length > 0) {
        const vendorAddress = vendorAddressParts.join('\n');
        doc.text(vendorAddress, 310, rightY, { width: 240 });
        rightY += doc.heightOfString(vendorAddress, { width: 240 }) + 2;
      }
      if (po.vendor?.phone) {
        doc.text(`Phone: ${po.vendor.phone}`, 310, rightY);
        rightY += 13;
      }

      // Use the maximum of the two columns' Y positions for the next section
      y = Math.max(leftY, rightY) + 15;

      // Draw a line separator
      doc.moveTo(50, y)
        .lineTo(doc.page.width - 50, y)
        .strokeColor(borderGray)
        .lineWidth(1)
        .stroke();

      y += 10;

      // Order Metadata Grid
      doc.fillColor(textColor).fontSize(9);

      // Row 1
      doc.font('Helvetica-Bold').text('PO ID:', 50, y);
      const shortPoId = po.id ? po.id.slice(0, 8).toUpperCase() : 'N/A';
      doc.font('Helvetica').text(shortPoId, 130, y);

      doc.font('Helvetica-Bold').text('Date Generated:', 300, y);
      doc.font('Helvetica').text(
        po.createdAt ? new Date(po.createdAt).toLocaleDateString() : 'N/A',
        400,
        y
      );

      y += 15;

      // Row 2
      doc.font('Helvetica-Bold').text('Created By:', 50, y);
      doc.font('Helvetica').text(po.createdBy || 'System', 130, y);

      if (po.approvedBy || po.approver) {
        doc.font('Helvetica-Bold').text('Approved By:', 300, y);
        const approverName = po.approver?.fullName || po.approvedBy || 'Manager';
        doc.font('Helvetica').text(approverName, 400, y);
        y += 15;
      } else {
        y += 15;
      }

      // Row 3 (Emails sent)
      if (po.emailsSent) {
        doc.font('Helvetica-Bold').text('Sent To:', 50, y);
        doc.font('Helvetica').text(po.emailsSent, 130, y, { width: doc.page.width - 180 });
        y += doc.heightOfString(po.emailsSent, { width: doc.page.width - 180 }) + 5;
      }

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
