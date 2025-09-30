// nodes/Plunet/core/parsers/item.ts
import {
    extractResultBase,
    type ResultBase,
    findFirstTag,
    findFirstTagBlock,
    findAllTagBlocks,
    objectify,
    deepObjectify,
    scopeToData,
    coerceScalar,
} from './common';

// ============================================================================
// ITEM MAPPERS
// ============================================================================

function mapItem(itemXml: string) {
    const o = deepObjectify(itemXml);
    
    // Handle the case where deepObjectify creates a nested structure with 'data' property
    const itemData = o.data || o;
    
    return {
        itemID: itemData.itemID ?? itemData.ItemID ?? undefined,
        projectID: itemData.projectID ?? itemData.ProjectID ?? undefined,
        projectType: itemData.projectType ?? itemData.ProjectType ?? undefined,
        orderID: itemData.orderID ?? itemData.OrderID ?? undefined,
        invoiceID: itemData.invoiceID ?? itemData.InvoiceID ?? undefined,
        briefDescription: itemData.briefDescription ?? itemData.BriefDescription ?? undefined,
        sourceLanguage: itemData.sourceLanguage ?? itemData.SourceLanguage ?? undefined,
        targetLanguage: itemData.targetLanguage ?? itemData.TargetLanguage ?? undefined,
        status: itemData.status ?? itemData.Status ?? undefined,
        totalPrice: itemData.totalPrice ?? itemData.TotalPrice ?? undefined,
        taxType: itemData.taxType ?? itemData.TaxType ?? undefined,
        jobIDList: itemData.jobIDList ?? itemData.JobIDList ?? undefined,
    };
}

// ============================================================================
// PARSERS
// ============================================================================

export function parseItemResult(xml: string): { item: any; statusMessage: string; statusCode: number } {
    const base = extractResultBase(xml);
    const dataBlock = findFirstTagBlock(xml, 'data');
    
    if (!dataBlock) {
        return {
            item: {},
            statusMessage: base.statusMessage || '',
            statusCode: base.statusCode || 0,
        };
    }
    
    const item = mapItem(dataBlock);
    return {
        item,
        statusMessage: base.statusMessage || '',
        statusCode: base.statusCode || 0,
    };
}

export function parseItemListResult(xml: string): { items: any[]; statusMessage: string; statusCode: number } {
    const base = extractResultBase(xml);
    const dataBlocks = findAllTagBlocks(xml, 'data');
    
    if (!dataBlocks || dataBlocks.length === 0) {
        return {
            items: [],
            statusMessage: base.statusMessage || '',
            statusCode: base.statusCode || 0,
        };
    }
    
    const items = dataBlocks.map(block => mapItem(block));
    return {
        items,
        statusMessage: base.statusMessage || '',
        statusCode: base.statusCode || 0,
    };
}
