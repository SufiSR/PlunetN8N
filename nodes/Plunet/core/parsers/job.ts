// nodes/Plunet/core/parsers/job.ts
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
// JOB MAPPERS
// ============================================================================

function mapJob(jobXml: string) {
    const o = deepObjectify(jobXml);
    
    // Handle the case where deepObjectify creates a nested structure with 'data' property
    const jobData = o.data || o;
    
    return {
        JobID: jobData.jobID ?? jobData.JobID ?? undefined,
        ProjectID: jobData.projectID ?? jobData.ProjectID ?? undefined,
        ResourceID: jobData.resourceID ?? jobData.ResourceID ?? undefined,
        ProjectType: jobData.projectType ?? jobData.ProjectType ?? undefined,
        Status: jobData.status ?? jobData.Status ?? undefined,
        JobTypeFull: jobData.jobTypeFull ?? jobData.JobTypeFull ?? undefined,
        JobTypeShort: jobData.jobTypeShort ?? jobData.JobTypeShort ?? undefined,
        CountSourceFiles: jobData.countSourceFiles ?? jobData.CountSourceFiles ?? undefined,
        ItemID: jobData.itemID ?? jobData.ItemID ?? undefined,
        StartDate: jobData.startDate ?? jobData.StartDate ?? undefined,
        DueDate: jobData.dueDate ?? jobData.DueDate ?? undefined,
    };
}

function mapAmount(amountXml: string) {
    const o = deepObjectify(amountXml);
    // Handle nested structure created by deepObjectify
    const amountData = o.amounts || o;
    return {
        baseUnitName: amountData.baseUnitName ?? amountData.BaseUnitName ?? undefined,
        grossQuantity: amountData.grossQuantity ?? amountData.GrossQuantity ?? undefined,
        netQuantity: amountData.netQuantity ?? amountData.NetQuantity ?? undefined,
        serviceType: amountData.serviceType ?? amountData.ServiceType ?? undefined,
    };
}

function mapJobMetric(metricXml: string) {
    const o = deepObjectify(metricXml);
    // Handle nested structure created by deepObjectify
    const metricData = o.data || o;
    
    // Find all amounts tags within the entire data scope
    const amounts = findAllTagBlocks(metricXml, 'amounts').map(mapAmount);
    
    return {
        totalPrice: metricData.totalPrice ?? metricData.TotalPrice ?? undefined,
        totalPriceJobCurrency: metricData.totalPriceJobCurrency ?? metricData.TotalPriceJobCurrency ?? undefined,
        amounts,
    };
}

function mapPriceUnit(unitXml: string) {
    const o = objectify(unitXml);
    return {
        PriceUnitID: o.PriceUnitID ?? o.priceUnitID ?? undefined,
        Description: o.Description ?? o.description ?? undefined,
        Memo: o.Memo ?? o.memo ?? undefined,
        ArticleNumber: o.ArticleNumber ?? o.articleNumber ?? undefined,
        Service: o.Service ?? o.service ?? undefined,
        isActive: o.isActive ?? o.Active ?? o.active ?? undefined,
        BaseUnit: o.BaseUnit ?? o.baseUnit ?? undefined,
    };
}

function mapPriceLine(lineXml: string) {
    const o = deepObjectify(lineXml);
    // Handle nested structure created by deepObjectify
    const lineData = o.data || o;
    return {
        PriceUnitID: lineData.PriceUnitID ?? lineData.priceUnitID ?? undefined,
        PriceLineID: lineData.PriceLineID ?? lineData.priceLineID ?? undefined,
        Memo: lineData.Memo ?? lineData.memo ?? undefined,
        Amount: lineData.Amount ?? lineData.amount ?? undefined,
        Amount_perUnit: lineData.Amount_perUnit ?? lineData.amount_perUnit ?? undefined,
        Time_perUnit: lineData.Time_perUnit ?? lineData.time_perUnit ?? undefined,
        Unit_price: lineData.Unit_price ?? lineData.unit_price ?? undefined,
        TaxType: lineData.TaxType ?? lineData.taxType ?? undefined,
        Sequence: lineData.Sequence ?? lineData.sequence ?? undefined,
    };
}

function mapJobTrackingTime(ttXml: string) {
    const o = objectify(ttXml);
    return {
        ResourceID: o.ResourceID ?? o.resourceID ?? undefined,
        Comment: o.Comment ?? o.comment ?? undefined,
        DateFrom: o.DateFrom ?? o.dateFrom ?? undefined,
        DateTo: o.DateTo ?? o.dateTo ?? undefined,
    };
}

// ============================================================================
// MAIN PARSERS
// ============================================================================

export function parseJobResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'JobResult');
    // For getJob_ForView, the job data is directly in the data tag, not wrapped in a Job tag
    const jobXml = findFirstTagBlock(scope, 'Job') || scope;
    const job = jobXml ? mapJob(jobXml) : undefined;
    return { job, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parseJobListResult(xml: string) {
    const base = extractResultBase(xml);
    
    // First, try to find JobListResult scope
    const jobListResultScope = findFirstTagBlock(xml, 'JobListResult');
    if (!jobListResultScope) {
        return { jobs: [], statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // Check if this is the new format with 'data' elements (for getJobListOfItem_ForView)
    const dataElements = findAllTagBlocks(jobListResultScope, 'data');
    if (dataElements.length > 0) {
        // New format: data elements contain job information directly
        const list = dataElements.map(mapJob);
        return { jobs: list, statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // Legacy format: Job elements
    const list = findAllTagBlocks(jobListResultScope, 'Job').map(mapJob);
    return { jobs: list, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parseJobMetricResult(xml: string) {
    const base = extractResultBase(xml);
    const jobMetricResultScope = findFirstTagBlock(xml, 'JobMetricResult');
    if (!jobMetricResultScope) {
        return { jobMetric: undefined, statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // The data is directly under JobMetricResult, not in a separate JobMetric tag
    const dataScope = findFirstTagBlock(jobMetricResultScope, 'data');
    if (!dataScope) {
        return { jobMetric: undefined, statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    const jobMetric = mapJobMetric(dataScope);
    return { jobMetric, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePriceUnitResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'PriceUnitResult');
    const unitXml = findFirstTagBlock(scope, 'PriceUnit');
    const priceUnit = unitXml ? mapPriceUnit(unitXml) : undefined;
    return { priceUnit, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePriceUnitListResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'PriceUnitListResult');
    const list = findAllTagBlocks(scope, 'PriceUnit').map(mapPriceUnit);
    return { priceUnits: list, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePriceLineResult(xml: string) {
    const base = extractResultBase(xml);
    const priceLineResultScope = findFirstTagBlock(xml, 'PriceLineResult');
    if (!priceLineResultScope) {
        return { priceLine: undefined, statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // The data is directly under PriceLineResult, not in a separate PriceLine tag
    const dataScope = findFirstTagBlock(priceLineResultScope, 'data');
    if (!dataScope) {
        return { priceLine: undefined, statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    const priceLine = mapPriceLine(dataScope);
    return { priceLine, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePriceLineListResult(xml: string) {
    const base = extractResultBase(xml);
    const priceLineListResultScope = findFirstTagBlock(xml, 'PriceLineListResult');
    if (!priceLineListResultScope) {
        return { priceLines: [], statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // Look for data elements within PriceLineListResult
    const dataElements = findAllTagBlocks(priceLineListResultScope, 'data');
    const list = dataElements.map(mapPriceLine);
    return { priceLines: list, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parseJobTrackingTimeListResult(xml: string) {
    const base = extractResultBase(xml);

    let scope = scopeToData(xml, 'JobTrackingTimeListResult');
    if (!/<(?:\w+:)?TrackingTimeList\b/i.test(scope)) {
        scope = findFirstTagBlock(xml, 'TrackingTimeList') ?? scope;
    }

    const listContainer = findFirstTagBlock(scope, 'TrackingTimeList') ?? scope;
    const itemsScope = findFirstTagBlock(listContainer, 'trackingTimeList') ?? listContainer;
    const times = findAllTagBlocks(itemsScope, 'JobTrackingTime').map(mapJobTrackingTime);

    const completedRaw = findFirstTag(listContainer, 'Completed') ?? findFirstTag(listContainer, 'completed');
    const completed = completedRaw != null ? coerceScalar(completedRaw) : undefined;

    return { times, completed, statusMessage: base.statusMessage, statusCode: base.statusCode };
}
