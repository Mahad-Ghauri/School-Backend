const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

/**
 * PDF Service
 * Generates professional PDFs for vouchers, receipts, and reports
 */
class PDFService {
  constructor() {
    this.schoolName = 'Muslim School & College';
    this.schoolAddress = 'Main Road, City, Country';
    this.schoolPhone = '+92-300-1234567';
    this.schoolEmail = 'info@muslimschool.edu.pk';
  }

  /**
   * Helper: Add header to PDF
   */
  addHeader(doc, title) {
    // School Name
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text(this.schoolName, { align: 'center' });
    
    // School Details
    doc.fontSize(10)
       .font('Helvetica')
       .text(this.schoolAddress, { align: 'center' })
       .text(`Phone: ${this.schoolPhone} | Email: ${this.schoolEmail}`, { align: 'center' });
    
    doc.moveDown(0.5);
    
    // Horizontal line
    doc.moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke();
    
    doc.moveDown(0.5);
    
    // Document Title
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(title, { align: 'center' });
    
    doc.moveDown(1);
  }

  /**
   * Helper: Add footer to PDF
   */
  addFooter(doc, pageNumber = 1) {
    const bottomY = 750;
    
    doc.fontSize(8)
       .font('Helvetica')
       .text(
         `Generated on: ${new Date().toLocaleDateString()} | Page ${pageNumber}`,
         50,
         bottomY,
         { align: 'center', width: 500 }
       );
    
    doc.moveTo(50, bottomY - 10)
       .lineTo(550, bottomY - 10)
       .stroke();
    
    doc.fontSize(8)
       .text('This is a computer-generated document. No signature required.', 50, bottomY + 10, {
         align: 'center',
         width: 500,
         italic: true
       });
  }

  /**
   * Helper: Add two-column layout
   */
  addTwoColumns(doc, leftContent, rightContent, y) {
    const leftX = 50;
    const rightX = 320;
    
    doc.fontSize(10).font('Helvetica');
    
    Object.keys(leftContent).forEach((key, index) => {
      const yPos = y + (index * 20);
      doc.font('Helvetica-Bold').text(`${key}:`, leftX, yPos);
      doc.font('Helvetica').text(leftContent[key], leftX + 100, yPos);
    });
    
    Object.keys(rightContent).forEach((key, index) => {
      const yPos = y + (index * 20);
      doc.font('Helvetica-Bold').text(`${key}:`, rightX, yPos);
      doc.font('Helvetica').text(rightContent[key], rightX + 100, yPos);
    });
  }

  /**
   * Helper: Create table
   */
  createTable(doc, headers, rows, startY, columnWidths) {
    let y = startY;
    const tableTop = y;
    const tableLeft = 50;
    
    // Draw header
    doc.font('Helvetica-Bold').fontSize(10);
    let x = tableLeft;
    
    headers.forEach((header, i) => {
      doc.text(header, x, y, { width: columnWidths[i], align: 'left' });
      x += columnWidths[i];
    });
    
    y += 20;
    
    // Draw header border
    doc.moveTo(tableLeft, y)
       .lineTo(tableLeft + columnWidths.reduce((a, b) => a + b, 0), y)
       .stroke();
    
    y += 5;
    
    // Draw rows
    doc.font('Helvetica').fontSize(9);
    
    rows.forEach((row) => {
      x = tableLeft;
      
      row.forEach((cell, i) => {
        doc.text(String(cell), x, y, { width: columnWidths[i], align: i === 0 ? 'left' : 'right' });
        x += columnWidths[i];
      });
      
      y += 20;
    });
    
    // Draw table border
    doc.rect(
      tableLeft,
      tableTop,
      columnWidths.reduce((a, b) => a + b, 0),
      y - tableTop
    ).stroke();
    
    return y;
  }

  /**
   * Generate Fee Voucher PDF
   * POST /api/vouchers/:id/pdf
   */
  async generateFeeVoucher(voucherId) {
    const client = await pool.connect();
    
    try {
      // Fetch voucher data
      const voucherResult = await client.query(
        `SELECT 
          v.id, v.month, v.created_at,
          s.name as student_name, s.roll_no, s.phone,
          c.name as class_name, c.class_type,
          sec.name as section_name,
          sch.id as class_history_id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN students s ON sch.student_id = s.id
         JOIN classes c ON sch.class_id = c.id
         JOIN sections sec ON sch.section_id = sec.id
         WHERE v.id = $1`,
        [voucherId]
      );

      if (voucherResult.rows.length === 0) {
        const error = new Error('Voucher not found');
        error.statusCode = 404;
        throw error;
      }

      const voucher = voucherResult.rows[0];

      // Fetch voucher items
      const itemsResult = await client.query(
        'SELECT item_type, amount FROM fee_voucher_items WHERE voucher_id = $1 ORDER BY id',
        [voucherId]
      );

      // Fetch payments
      const paymentsResult = await client.query(
        'SELECT amount, payment_date FROM fee_payments WHERE voucher_id = $1 ORDER BY payment_date',
        [voucherId]
      );

      // Calculate totals
      const totalAmount = itemsResult.rows.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const totalPaid = paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      const balance = totalAmount - totalPaid;

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `fee-voucher-${voucherId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Add header
      this.addHeader(doc, 'FEE VOUCHER');

      // Voucher details
      const monthStr = new Date(voucher.month).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });

      this.addTwoColumns(
        doc,
        {
          'Voucher No': `FV-${String(voucherId).padStart(6, '0')}`,
          'Student Name': voucher.student_name,
          'Roll No': voucher.roll_no || 'N/A'
        },
        {
          'Issue Date': new Date(voucher.created_at).toLocaleDateString(),
          'Class': `${voucher.class_name} (${voucher.class_type})`,
          'Section': voucher.section_name
        },
        doc.y
      );

      doc.moveDown(2);

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Fee Month: ${monthStr}`, { align: 'center' });

      doc.moveDown(1);

      // Fee items table
      const tableY = this.createTable(
        doc,
        ['Fee Description', 'Amount (Rs.)'],
        itemsResult.rows.map(item => [
          item.item_type.replace('_', ' '),
          parseFloat(item.amount).toFixed(2)
        ]),
        doc.y,
        [350, 150]
      );

      doc.moveDown(1);

      // Totals
      const totalsY = tableY + 20;
      doc.font('Helvetica-Bold').fontSize(11);
      
      doc.text('Total Amount:', 350, totalsY);
      doc.text(`Rs. ${totalAmount.toFixed(2)}`, 450, totalsY, { align: 'right', width: 100 });
      
      if (totalPaid > 0) {
        doc.text('Amount Paid:', 350, totalsY + 20);
        doc.text(`Rs. ${totalPaid.toFixed(2)}`, 450, totalsY + 20, { align: 'right', width: 100 });
        
        doc.fontSize(12).fillColor(balance > 0 ? 'red' : 'green');
        doc.text('Balance:', 350, totalsY + 40);
        doc.text(`Rs. ${balance.toFixed(2)}`, 450, totalsY + 40, { align: 'right', width: 100 });
        doc.fillColor('black');
      }

      doc.moveDown(3);

      // Payment status
      if (balance === 0) {
        doc.fontSize(14)
           .fillColor('green')
           .font('Helvetica-Bold')
           .text('✓ PAID IN FULL', { align: 'center' })
           .fillColor('black');
      } else {
        doc.fontSize(12)
           .fillColor('red')
           .font('Helvetica-Bold')
           .text('PAYMENT DUE', { align: 'center' })
           .fillColor('black');
      }

      doc.moveDown(1);

      // Payment instructions
      doc.fontSize(9)
         .font('Helvetica')
         .text('Payment can be made at the school office during working hours.', { align: 'center' })
         .text('For bank transfer, please use voucher number as reference.', { align: 'center' });

      // Add footer
      this.addFooter(doc);

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Generate Salary Slip PDF
   * GET /api/salaries/voucher/:id/pdf
   */
  async generateSalarySlip(voucherId) {
    const client = await pool.connect();
    
    try {
      // Fetch salary voucher data
      const voucherResult = await client.query(
        `SELECT 
          v.id, v.month, v.created_at,
          f.name as faculty_name, f.cnic, f.role, f.subject,
          ss.base_salary
         FROM salary_vouchers v
         JOIN faculty f ON v.faculty_id = f.id
         LEFT JOIN LATERAL (
           SELECT base_salary 
           FROM salary_structure 
           WHERE faculty_id::int = f.id::int 
             AND DATE_TRUNC('month', effective_from) <= DATE_TRUNC('month', v.month::date)
           ORDER BY effective_from DESC 
           LIMIT 1
         ) ss ON true
         WHERE v.id = $1::int`,
        [voucherId]
      );

      if (voucherResult.rows.length === 0) {
        const error = new Error('Salary voucher not found');
        error.statusCode = 404;
        throw error;
      }

      const voucher = voucherResult.rows[0];

      // Fetch adjustments
      const adjustmentsResult = await client.query(
        'SELECT type, amount, calc_type FROM salary_adjustments WHERE voucher_id = $1',
        [voucherId]
      );

      // Fetch payments
      const paymentsResult = await client.query(
        'SELECT amount, payment_date FROM salary_payments WHERE voucher_id = $1 ORDER BY payment_date',
        [voucherId]
      );

      // Calculate amounts
      let baseSalary = parseFloat(voucher.base_salary) || 0;
      let bonusTotal = 0;
      let advanceTotal = 0;

      adjustmentsResult.rows.forEach(adj => {
        const amount = parseFloat(adj.amount);
        let calculatedAmount = amount;

        if (adj.calc_type === 'PERCENTAGE') {
          calculatedAmount = (baseSalary * amount) / 100;
        }

        if (adj.type === 'BONUS') {
          bonusTotal += calculatedAmount;
        } else if (adj.type === 'ADVANCE') {
          advanceTotal += calculatedAmount;
        }
      });

      const grossSalary = baseSalary + bonusTotal;
      const netSalary = grossSalary - advanceTotal;
      const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balance = netSalary - totalPaid;

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `salary-slip-${voucherId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Add header
      this.addHeader(doc, 'SALARY SLIP');

      // Employee details
      const monthStr = new Date(voucher.month).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });

      this.addTwoColumns(
        doc,
        {
          'Slip No': `SS-${String(voucherId).padStart(6, '0')}`,
          'Employee Name': voucher.faculty_name,
          'CNIC': voucher.cnic || 'N/A'
        },
        {
          'Issue Date': new Date(voucher.created_at).toLocaleDateString(),
          'Designation': voucher.role || 'N/A',
          'Subject': voucher.subject || 'N/A'
        },
        doc.y
      );

      doc.moveDown(2);

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Salary Month: ${monthStr}`, { align: 'center' });

      doc.moveDown(1);

      // Salary breakdown
      const rows = [
        ['Basic Salary', baseSalary.toFixed(2)]
      ];

      adjustmentsResult.rows.forEach(adj => {
        const amount = parseFloat(adj.amount);
        let calculatedAmount = amount;
        let label = adj.type;

        if (adj.calc_type === 'PERCENTAGE') {
          calculatedAmount = (baseSalary * amount) / 100;
          label += ` (${amount}%)`;
        }

        rows.push([label, calculatedAmount.toFixed(2)]);
      });

      const tableY = this.createTable(
        doc,
        ['Description', 'Amount (Rs.)'],
        rows,
        doc.y,
        [350, 150]
      );

      doc.moveDown(1);

      // Totals
      const totalsY = tableY + 20;
      doc.font('Helvetica-Bold').fontSize(11);
      
      doc.text('Gross Salary:', 350, totalsY);
      doc.text(`Rs. ${grossSalary.toFixed(2)}`, 450, totalsY, { align: 'right', width: 100 });
      
      if (advanceTotal > 0) {
        doc.fillColor('red');
        doc.text('Less: Advance:', 350, totalsY + 20);
        doc.text(`Rs. ${advanceTotal.toFixed(2)}`, 450, totalsY + 20, { align: 'right', width: 100 });
        doc.fillColor('black');
      }
      
      doc.fontSize(12);
      doc.text('Net Salary:', 350, totalsY + 40);
      doc.text(`Rs. ${netSalary.toFixed(2)}`, 450, totalsY + 40, { align: 'right', width: 100 });

      if (totalPaid > 0) {
        doc.fontSize(11);
        doc.text('Amount Paid:', 350, totalsY + 65);
        doc.text(`Rs. ${totalPaid.toFixed(2)}`, 450, totalsY + 65, { align: 'right', width: 100 });
        
        doc.fillColor(balance > 0 ? 'red' : 'green');
        doc.text('Balance:', 350, totalsY + 85);
        doc.text(`Rs. ${balance.toFixed(2)}`, 450, totalsY + 85, { align: 'right', width: 100 });
        doc.fillColor('black');
      }

      doc.moveDown(3);

      // Payment status
      if (balance === 0) {
        doc.fontSize(14)
           .fillColor('green')
           .font('Helvetica-Bold')
           .text('✓ PAID', { align: 'center' })
           .fillColor('black');
      } else {
        doc.fontSize(12)
           .fillColor('red')
           .font('Helvetica-Bold')
           .text('PAYMENT PENDING', { align: 'center' })
           .fillColor('black');
      }

      doc.moveDown(2);

      // Signature section
      doc.fontSize(10).font('Helvetica');
      doc.text('_____________________', 80, doc.y + 40);
      doc.text('Employee Signature', 80, doc.y + 5);
      
      doc.text('_____________________', 380, doc.y - 25);
      doc.text('Authorized Signature', 380, doc.y + 5);

      // Add footer
      this.addFooter(doc);

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Generate Payment Receipt PDF
   * GET /api/fees/payment/:id/receipt
   */
  async generatePaymentReceipt(paymentId, type = 'fee') {
    const client = await pool.connect();
    
    try {
      let paymentData;

      if (type === 'fee') {
        // Fetch fee payment
        const result = await client.query(
          `SELECT 
            fp.id, fp.amount, fp.payment_date,
            v.id as voucher_id, v.month,
            s.name as payer_name, s.roll_no,
            c.name as class_name, sec.name as section_name
           FROM fee_payments fp
           JOIN fee_vouchers v ON fp.voucher_id = v.id
           JOIN student_class_history sch ON v.student_class_history_id = sch.id
           JOIN students s ON sch.student_id = s.id
           JOIN classes c ON sch.class_id = c.id
           JOIN sections sec ON sch.section_id = sec.id
           WHERE fp.id = $1`,
          [paymentId]
        );

        if (result.rows.length === 0) {
          const error = new Error('Payment not found');
          error.statusCode = 404;
          throw error;
        }

        paymentData = result.rows[0];
        paymentData.payment_for = 'School Fee';
        paymentData.reference = `FV-${String(paymentData.voucher_id).padStart(6, '0')}`;
      } else if (type === 'salary') {
        // Fetch salary payment
        const result = await client.query(
          `SELECT 
            sp.id, sp.amount, sp.payment_date,
            v.id as voucher_id, v.month,
            f.name as payer_name, f.role
           FROM salary_payments sp
           JOIN salary_vouchers v ON sp.voucher_id = v.id
           JOIN faculty f ON v.faculty_id = f.id
           WHERE sp.id = $1`,
          [paymentId]
        );

        if (result.rows.length === 0) {
          const error = new Error('Payment not found');
          error.statusCode = 404;
          throw error;
        }

        paymentData = result.rows[0];
        paymentData.payment_for = 'Salary Payment';
        paymentData.reference = `SS-${String(paymentData.voucher_id).padStart(6, '0')}`;
      }

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `receipt-${paymentId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Add header
      this.addHeader(doc, 'PAYMENT RECEIPT');

      // Receipt details
      this.addTwoColumns(
        doc,
        {
          'Receipt No': `R-${String(paymentId).padStart(6, '0')}`,
          'Payment Date': new Date(paymentData.payment_date).toLocaleDateString(),
          'Paid By': paymentData.payer_name
        },
        {
          'Reference': paymentData.reference,
          'Payment For': paymentData.payment_for,
          'Month': new Date(paymentData.month).toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
          })
        },
        doc.y
      );

      doc.moveDown(2);

      // Amount box
      doc.roundedRect(150, doc.y, 300, 80, 5).stroke();
      
      doc.fontSize(12)
         .font('Helvetica')
         .text('Amount Received:', 170, doc.y + 15);
      
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text(`Rs. ${parseFloat(paymentData.amount).toFixed(2)}`, 170, doc.y + 25);

      doc.moveDown(6);

      // Amount in words
      const amountInWords = this.numberToWords(parseFloat(paymentData.amount));
      doc.fontSize(11)
         .font('Helvetica')
         .text(`Amount in words: ${amountInWords}`, { align: 'center', italic: true });

      doc.moveDown(3);

      // Thank you message
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Thank You!', { align: 'center' });

      doc.fontSize(10)
         .font('Helvetica')
         .text('Please keep this receipt for your records.', { align: 'center' });

      doc.moveDown(3);

      // Signature
      doc.text('_____________________', 380, doc.y + 20);
      doc.text('Received By', 400, doc.y + 5);

      // Add footer
      this.addFooter(doc);

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Convert number to words
   */
  numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero Rupees Only';

    const numStr = Math.floor(num).toString();
    const paisa = Math.round((num - Math.floor(num)) * 100);

    let words = '';

    if (numStr.length > 6) {
      const lakhs = parseInt(numStr.slice(0, -5));
      words += this.convertHundreds(lakhs) + ' Lakh ';
    }

    if (numStr.length > 3) {
      const thousands = parseInt(numStr.slice(-5, -3));
      if (thousands > 0) {
        words += this.convertHundreds(thousands) + ' Thousand ';
      }
    }

    const hundreds = parseInt(numStr.slice(-3));
    if (hundreds > 0) {
      words += this.convertHundreds(hundreds) + ' ';
    }

    words += 'Rupees';

    if (paisa > 0) {
      words += ` and ${this.convertHundreds(paisa)} Paisa`;
    }

    return words + ' Only';
  }

  /**
   * Helper: Convert hundreds
   */
  convertHundreds(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    let words = '';

    if (num >= 100) {
      words += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }

    if (num >= 20) {
      words += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    } else if (num >= 10) {
      words += teens[num - 10] + ' ';
      return words.trim();
    }

    if (num > 0) {
      words += ones[num] + ' ';
    }

    return words.trim();
  }
}

module.exports = new PDFService();
