import { DeclarationAttributes, ElementCompact, js2xml } from "xml-js";

//#region Interfaces
export interface Payment {
  /** Max length is 35 */
  id: string;
  /** The name of the debtor */
  name: string;
  /** The IBAN of the debtor */
  iban: string;
  /** The BIC of the debtor */
  bic: string;
  mandateId?: string;
  mandateSignatureDate?: Date;

  amount: number;
  remittanceInformation: string;
  end2endReference?: string;
}

export interface CreditorPayments {
  /** Max length is 35 */
  id: string;
  batchBooking?: boolean;
  /** When the payment should be executed */
  requestedExecutionDate: Date;
  collectionDate?: Date;

  creditor: {
    id?: string;
    name: string;
    iban: string;
    bic: string;
  };

  payments: Payment[];
}

export interface SepaData {
  xmlData?: {
    painVersion?: PAIN_VERSIONS;
    xmlVersion?: string;
    xmlEncoding?: string;
    xsiNamespace?: string;
    xsiXmls?: string;
  };

  localInstrumentation?: LOCAL_INSTRUMENTATION;
  sequenceType?: SEQUENCE_TYPE;
  batchBooking?: boolean;

  /** Max length is 35 */
  id: string;
  creationDate: Date;
  /** Max length is 70 */
  initiatorName: string;

  positions: CreditorPayments[];
}
//#endregion

//#region enum
export enum PAIN_VERSIONS {
  "pain.001.001.02" = "pain.001.001.02",
  "pain.001.003.02" = "pain.001.003.02",
  "pain.001.001.03" = "pain.001.001.03",
  "pain.001.003.03" = "pain.001.003.03",
  "pain.008.001.01" = "pain.008.001.01",
  "pain.008.003.01" = "pain.008.003.01",
  "pain.008.001.02" = "pain.008.001.02",
  "pain.008.003.02" = "pain.008.003.02",
}

export enum LOCAL_INSTRUMENTATION {
  "CORE" = "CORE",
  "COR1" = "COR1",
  "B2B" = "B2B",
}

export enum SEQUENCE_TYPE {
  "FRST" = "FRST",
  "RCUR" = "RCUR",
  "OOFF" = "OOFF",
  "FNAL" = "FNAL",
}
//#endregion

//#region const
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
const XSI_XMLS = "urn:iso:std:iso:20022:tech:xsd:";
const PAIN_VERSION = PAIN_VERSIONS["pain.001.001.03"];
const XML_VERSION = "1.0";
const XML_ENCODING = "UTF-8";
//#endregion

export default function createSepaXML(
  sepaData: SepaData,
  prettyPrint?: boolean,
): string {
  const painFormat = sepaData.xmlData?.painVersion ?? PAIN_VERSION;
  const painVersion =
    parseInt(
      painFormat.substring(painFormat.length, painFormat.length - 2),
      10,
    ) + (painFormat.indexOf("pain.008") === 0 ? 1 : 0);

  const declaration: { _attributes: DeclarationAttributes } = {
    _attributes: {
      version: sepaData.xmlData?.xmlVersion ?? XML_VERSION,
      encoding: sepaData.xmlData?.xmlEncoding ?? XML_ENCODING,
    },
  };

  checkLength(sepaData.id, "sepaData.id", 35);
  checkLength(sepaData.initiatorName, "sepaData.initiatorName", 70);

  const Document: ElementCompact = {
    _attributes: {
      xmlns: `${sepaData.xmlData?.xsiXmls ?? XSI_XMLS}${painFormat}`,
      "xmlns:xsi": sepaData.xmlData?.xsiNamespace ?? XSI_NAMESPACE,
      "xmlns:schemaLocation": `${
        sepaData.xmlData?.xsiXmls ?? XSI_XMLS
      }${painFormat} ${painFormat}.xsd`,
    },
    CstmrCdtTrfInitn: {
      GrpHdr: {
        MsgId: sepaData.id,
        CreDtTm: sepaData.creationDate.toISOString().substring(0, 19),
        NbOfTxs: sepaData.positions.reduce(
          (sum, item) => sum + item.payments.length,
          0,
        ),
        CtrlSum: sepaData.positions
          .reduce(
            (sum, item) =>
              sum +
              item.payments.reduce((sum, payment) => sum + payment.amount, 0),
            0,
          )
          .toFixed(2),
        InitgPty: {
          Nm: sepaData.initiatorName,
        },
      },
      PmtInf: getPmtInf(sepaData, painFormat, painVersion),
    },
  };

  if (painVersion === 2) {
    Document.CstmrCdtTrfInitn.GrpHdr.BtchBookg = (
      sepaData.batchBooking ?? false
    ).toString();
    Document.CstmrCdtTrfInitn.GrpHdr.Grpg = "MIXD";
  }

  return js2xml(
    { _declaration: declaration, Document },
    { compact: true, spaces: prettyPrint ? 2 : undefined },
  );
}

const getPmtInf = (
  sepaData: SepaData,
  painFormat: PAIN_VERSIONS,
  painVersion: number,
) =>
  sepaData.positions.map((item, index) => {
    checkLength(item.id, `sepaData.positions[${index}].id`, 35);
    checkLength(
      item.creditor.name,
      `sepaData.positions[${index}].creditor.name`,
      70,
    );

    const pmtMtd = painFormat.indexOf("pain.001") === 0 ? "TRF" : "DD";

    const pmtInfData: ElementCompact = {
      PmtInfId: item.id,
      PmtMtd: pmtMtd,
      PmtTpInf: { SvcLvl: { Cd: "SEPA" } },
      ChrgBr: "SLEV",
    };

    if (painVersion === 3) {
      pmtInfData.BtchBookg = (item.batchBooking ?? false).toString();
      pmtInfData.NbOfTxs = item.payments.length;
      pmtInfData.CtrlSum = item.payments
        .reduce((sum, payment) => sum + payment.amount, 0)
        .toFixed(2);
    }

    if (pmtMtd === "DD") {
      pmtInfData.PmtTpInf.LclInstrm = {
        Cd: sepaData.localInstrumentation ?? "",
      };
      pmtInfData.SeqTp = sepaData.sequenceType ?? undefined;
      pmtInfData.ReqdColltnDt = item.collectionDate
        ?.toISOString()
        .substring(0, 10);

      pmtInfData.Cdtr = {
        Nm: item.creditor.name,
      };
      pmtInfData.CdtrAcct = {
        Id: {
          IBAN: item.creditor.iban,
        },
      };
      pmtInfData.CdtrAgt = { FinInstnId: { BIC: item.creditor.bic } };
      pmtInfData.CdtrSchmeId = {
        Id: {
          PrvtId: {
            Othr: {
              Id: item.creditor.id ?? "",
              SchmeNm: {
                Prtry: "SEPA",
              },
            },
          },
        },
      };
    } else {
      pmtInfData.ReqdExctnDt = item.requestedExecutionDate
        .toISOString()
        .substring(0, 10);

      pmtInfData.Dbtr = {
        Nm: item.creditor.name,
      };
      pmtInfData.DbtrAcct = {
        Id: {
          IBAN: item.creditor.iban,
        },
      };
      pmtInfData.DbtrAgt = { FinInstnId: { BIC: item.creditor.bic } };
    }

    pmtInfData.CdtTrfTxInf = getPayments(item.payments, index, pmtMtd);

    return pmtInfData;
  });

const getPayments = (
  payments: Payment[],
  index: number,
  pmtMtd: "TRF" | "DD",
) =>
  payments.map((payment, paymentIndex) => {
    checkLength(
      payment.id,
      `sepaData.positions[${index}].payments[${paymentIndex}].id`,
      35,
    );
    checkLength(
      payment.name,
      `sepaData.positions[${index}].payments[${paymentIndex}].name`,
      35,
    );

    const paymentData: ElementCompact = {
      PmtId: {
        InstrId: payment.id,
      },
      RmtInf: { Ustrd: payment.remittanceInformation },
    };

    if (payment.end2endReference) {
      paymentData.PmtId.EndToEndId = payment.end2endReference;
    }

    if (pmtMtd === "DD") {
      paymentData.InstdAmt = {
        _attributes: { Ccy: "EUR" },
        _text: payment.amount.toFixed(2),
      };
      paymentData.DrctDbtTx = {
        MndtRltdInf: {
          MndtId: payment.mandateId ?? "",
          DtOfSgntr:
            payment.mandateSignatureDate?.toISOString().substring(0, 10) ?? "",
        },
      };

      paymentData.DbtrAcct = {
        Id: {
          IBAN: payment.iban,
        },
      };
      paymentData.DbtrAgt = {
        FinInstnId: { BIC: payment.bic },
      };
      paymentData.Dbtr = { Nm: payment.name };
    } else {
      paymentData.Amt = {
        _attributes: { Ccy: "EUR" },
        InstdAmt: payment.amount.toFixed(2),
      };

      paymentData.CdtrAcct = {
        Id: {
          IBAN: payment.iban,
        },
      };
      paymentData.CdtrAgt = {
        FinInstnId: { BIC: payment.bic },
      };
      paymentData.Cdtr = { Nm: payment.name };
    }

    return paymentData;
  });

function checkLength(value: string, name: string, length: number) {
  if (value.length > length) {
    throw new Error(`Max length for ${name} is ${length}`);
  }
}
