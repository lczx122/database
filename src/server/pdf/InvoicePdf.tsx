import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

// Printable sales document (invoice / credit note / debit note).
// Rendered server-side with renderToBuffer — keep everything self-contained.

export interface PdfCompany {
  name: string;
  tin: string;
  brn: string;
  sstRegistrationNo: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postcode: string;
  city: string;
  stateCode: string;
  countryCode: string;
  phone: string;
  email: string | null;
}

export interface PdfBuyer {
  name: string;
  tin: string;
  idType: string;
  idValue: string;
  sstNo: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postcode: string;
  city: string;
  stateCode: string;
  countryCode: string;
}

export interface PdfLine {
  lineNo: number;
  description: string;
  quantity: string;
  uomCode: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PdfValidation {
  url: string;
  qrDataUrl: string;
  uuid: string;
  longId: string;
}

export interface InvoicePdfProps {
  title: string; // "INVOICE" | "CREDIT NOTE" | "DEBIT NOTE"
  company: PdfCompany;
  docNo: string;
  docDate: string;
  status: string;
  currencyCode: string;
  paymentTermsDays: number;
  notes: string | null;
  buyer: PdfBuyer;
  lines: PdfLine[];
  subtotal: string;
  taxTotal: string;
  total: string;
  validation?: PdfValidation | null;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  muted: { color: "#444" },
  docTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docMeta: { textAlign: "right", marginTop: 3 },
  sectionLabel: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 3 },
  buyerName: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  table: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#222" },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
    paddingVertical: 4,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, textTransform: "uppercase", color: "#333" },
  cNo: { width: "5%" },
  cDesc: { width: "33%", paddingRight: 4 },
  cQty: { width: "9%", textAlign: "right" },
  cUom: { width: "8%", textAlign: "center" },
  cPrice: { width: "12%", textAlign: "right" },
  cDisc: { width: "10%", textAlign: "right" },
  cTax: { width: "10%", textAlign: "right" },
  cAmt: { width: "13%", textAlign: "right" },
  totalsBlock: { marginTop: 8, alignSelf: "flex-end", width: 200 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: "#222",
    marginTop: 2,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  footer: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
  validationBox: { alignItems: "center", width: 150 },
  qr: { width: 90, height: 90 },
  validationText: { fontSize: 7, color: "#444", marginTop: 3, textAlign: "center" },
  watermark: {
    position: "absolute",
    top: 300,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 60,
    color: "#eee",
    fontFamily: "Helvetica-Bold",
  },
});

const addressLines = (p: {
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postcode: string;
  city: string;
  stateCode: string;
  countryCode: string;
}): string[] =>
  [
    p.addressLine1,
    p.addressLine2 ?? "",
    p.addressLine3 ?? "",
    `${p.postcode} ${p.city}`.trim(),
    `${p.stateCode}, ${p.countryCode}`,
  ].filter((l) => l.trim() !== "");

export function InvoicePdf(props: InvoicePdfProps) {
  const { company, buyer, validation } = props;
  return (
    <Document title={`${props.title} ${props.docNo}`}>
      <Page size="A4" style={styles.page}>
        {props.status !== "issued" ? (
          <Text style={styles.watermark}>{props.status.toUpperCase()}</Text>
        ) : null}

        <View style={styles.headerRow}>
          <View style={{ maxWidth: 280 }}>
            <Text style={styles.companyName}>{company.name}</Text>
            {addressLines(company).map((line, i) => (
              <Text key={i} style={styles.muted}>
                {line}
              </Text>
            ))}
            <Text style={styles.muted}>TIN: {company.tin}   BRN: {company.brn}</Text>
            {company.sstRegistrationNo ? (
              <Text style={styles.muted}>SST No: {company.sstRegistrationNo}</Text>
            ) : null}
            <Text style={styles.muted}>
              {company.phone}
              {company.email ? `   ${company.email}` : ""}
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>{props.title}</Text>
            <Text style={styles.docMeta}>No: {props.docNo}</Text>
            <Text style={styles.docMeta}>Date: {formatDate(props.docDate)}</Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={styles.buyerName}>{buyer.name}</Text>
          {addressLines(buyer).map((line, i) => (
            <Text key={i} style={styles.muted}>
              {line}
            </Text>
          ))}
          <Text style={styles.muted}>
            TIN: {buyer.tin || "-"}   {buyer.idType}: {buyer.idValue || "-"}
            {buyer.sstNo ? `   SST: ${buyer.sstNo}` : ""}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.tr, { borderBottomColor: "#222" }]}>
            <Text style={[styles.th, styles.cNo]}>No</Text>
            <Text style={[styles.th, styles.cDesc]}>Description</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            <Text style={[styles.th, styles.cUom]}>UOM</Text>
            <Text style={[styles.th, styles.cPrice]}>Unit price</Text>
            <Text style={[styles.th, styles.cDisc]}>Discount</Text>
            <Text style={[styles.th, styles.cTax]}>Tax</Text>
            <Text style={[styles.th, styles.cAmt]}>Amount</Text>
          </View>
          {props.lines.map((line) => (
            <View key={line.lineNo} style={styles.tr} wrap={false}>
              <Text style={styles.cNo}>{line.lineNo}</Text>
              <Text style={styles.cDesc}>{line.description}</Text>
              <Text style={styles.cQty}>{Number.parseFloat(line.quantity)}</Text>
              <Text style={styles.cUom}>{line.uomCode}</Text>
              <Text style={styles.cPrice}>{formatMoney(line.unitPrice)}</Text>
              <Text style={styles.cDisc}>{formatMoney(line.discountAmount)}</Text>
              <Text style={styles.cTax}>{formatMoney(line.taxAmount)}</Text>
              <Text style={styles.cAmt}>{formatMoney(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{formatMoney(props.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax</Text>
            <Text>{formatMoney(props.taxTotal)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text>Total ({props.currencyCode})</Text>
            <Text>{formatMoney(props.total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={{ maxWidth: 300 }}>
            <Text style={styles.sectionLabel}>Payment terms</Text>
            <Text>
              {props.paymentTermsDays > 0
                ? `Payment within ${props.paymentTermsDays} days`
                : "Due on receipt"}
            </Text>
            {props.notes ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text>{props.notes}</Text>
              </View>
            ) : null}
          </View>
          {validation ? (
            <View style={styles.validationBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
              <Image src={validation.qrDataUrl} style={styles.qr} />
              <Text style={[styles.validationText, { fontFamily: "Helvetica-Bold" }]}>
                Validated by LHDN
              </Text>
              <Text style={styles.validationText}>UUID: {validation.uuid}</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
