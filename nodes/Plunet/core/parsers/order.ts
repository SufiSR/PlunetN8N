import { ResultBase, getDataNode, asStr, asNum, toArray } from '../xml';

export interface Order {
    orderID?: number;
    orderNo?: string;
    orderNo_for_View?: string;
    orderDisplayName?: string;
    subject?: string;
    orderDate?: string;
    orderClosingDate?: string;
    creationDate?: string;
    deliveryComment?: string;
    externalID?: string;
    projectCategory?: string;
    projectStatus?: number;
    projectStatusLabel?: string;
    requestID?: number;
    masterProjectID?: number;
    en15038Requested?: boolean;
    en15038?: boolean;
    languageCombinations?: string[];
    links?: string[];
    orderConfirmations?: string[];
    // Additional fields from actual response
    currency?: string;
    customerContactID?: number;
    customerID?: number;
    projectManagerID?: number;
    projectName?: string;
    rate?: number;
}

export interface OrderResult extends ResultBase {
    order?: Order;
}

export function parseOrderResult(xml: string): OrderResult {
    const base: ResultBase = {
        statusCode: asNum(xml.match(/<statusCode>(.*?)<\/statusCode>/)?.[1]),
        statusMessage: asStr(xml.match(/<statusMessage>(.*?)<\/statusMessage>/)?.[1]),
    };

    const data = getDataNode(xml);
    if (!data || typeof data !== 'object') {
        return { ...base, order: undefined };
    }

    const orderData = data as Record<string, unknown>;
    const order: Order = {};

    // Parse basic order fields
    order.orderID = asNum(orderData.orderID);
    order.orderNo = asStr(orderData.orderNo);
    order.orderNo_for_View = asStr(orderData.orderNo_for_View);
    order.orderDisplayName = asStr(orderData.orderDisplayName);
    order.subject = asStr(orderData.subject);
    order.orderDate = asStr(orderData.orderDate);
    order.orderClosingDate = asStr(orderData.orderClosingDate);
    order.creationDate = asStr(orderData.creationDate);
    order.deliveryComment = asStr(orderData.deliveryComment);
    order.externalID = asStr(orderData.externalID);
    order.projectCategory = asStr(orderData.projectCategory);
    order.projectStatus = asNum(orderData.projectStatus);
    order.requestID = asNum(orderData.requestID);
    order.masterProjectID = asNum(orderData.masterProjectID);
    order.en15038Requested = Boolean(orderData.en15038Requested);
    order.en15038 = Boolean(orderData.en15038);
    
    // Parse additional fields from actual response
    order.currency = asStr(orderData.currency);
    order.customerContactID = asNum(orderData.customerContactID);
    order.customerID = asNum(orderData.customerID);
    order.projectManagerID = asNum(orderData.projectManagerID);
    order.projectName = asStr(orderData.projectName);
    order.rate = asNum(orderData.rate);

    // Parse arrays
    if (orderData.languageCombinations) {
        order.languageCombinations = toArray(orderData.languageCombinations).map(asStr).filter(Boolean) as string[];
    }
    if (orderData.links) {
        order.links = toArray(orderData.links).map(asStr).filter(Boolean) as string[];
    }
    if (orderData.orderConfirmations) {
        order.orderConfirmations = toArray(orderData.orderConfirmations).map(asStr).filter(Boolean) as string[];
    }

    return { ...base, order };
}
