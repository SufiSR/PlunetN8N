// nodes/Plunet/core/parsers/job.ts
import {
    extractResultBase,
    type ResultBase,
    findFirstTag,
    findFirstTagBlock,
    findAllTagBlocks,
    objectify,
    scopeToData,
    coerceScalar,
} from './common';

// ============================================================================
// JOB MAPPERS
// ============================================================================

function mapJob(jobXml: string) {
    const o = objectify(jobXml);
    return {
        JobID: o.JobID ?? o.jobID ?? undefined,
        ProjectID: o.ProjectID ?? o.projectID ?? undefined,
        ResourceID: o.ResourceID ?? o.resourceID ?? undefined,
        ProjectType: o.ProjectType ?? o.projectType ?? undefined,
        Status: o.Status ?? o.status ?? undefined,
        JobTypeFull: o.JobTypeFull ?? o.jobTypeFull ?? undefined,
        JobTypeShort: o.JobTypeShort ?? o.jobTypeShort ?? undefined,
        CountSourceFiles: o.CountSourceFiles ?? o.countSourceFiles ?? undefined,
        ItemID: o.ItemID ?? o.itemID ?? undefined,
        StartDate: o.StartDate ?? o.startDate ?? undefined,
        DueDate: o.DueDate ?? o.dueDate ?? undefined,
    };
}

function mapAmount(amountXml: string) {
    const o = objectify(amountXml);
    return {
        baseUnitName: o.baseUnitName ?? o.BaseUnitName ?? undefined,
        grossQuantity: o.grossQuantity ?? o.GrossQuantity ?? undefined,
        netQuantity: o.netQuantity ?? o.NetQuantity ?? undefined,
        serviceType: o.serviceType ?? o.ServiceType ?? undefined,
    };
}

function mapJobMetric(metricXml: string) {
    const o = objectify(metricXml);
    const amountsScope = findFirstTagBlock(metricXml, 'amounts') ?? metricXml;
    const amounts = findAllTagBlocks(amountsScope, 'Amount').map(mapAmount);
    return {
        totalPrice: o.totalPrice ?? o.TotalPrice ?? undefined,
        totalPriceJobCurrency: o.totalPriceJobCurrency ?? o.TotalPriceJobCurrency ?? undefined,
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
    const o = objectify(lineXml);
    return {
        PriceUnitID: o.PriceUnitID ?? o.priceUnitID ?? undefined,
        PriceLineID: o.PriceLineID ?? o.priceLineID ?? undefined,
        Memo: o.Memo ?? o.memo ?? undefined,
        Amount: o.Amount ?? o.amount ?? undefined,
        Amount_perUnit: o.Amount_perUnit ?? o.amount_perUnit ?? undefined,
        Time_perUnit: o.Time_perUnit ?? o.time_perUnit ?? undefined,
        Unit_price: o.Unit_price ?? o.unit_price ?? undefined,
        TaxType: o.TaxType ?? o.taxType ?? undefined,
        Sequence: o.Sequence ?? o.sequence ?? undefined,
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
    const scope = scopeToData(xml, 'JobMetricResult');
    const metricXml = findFirstTagBlock(scope, 'JobMetric');
    const jobMetric = metricXml ? mapJobMetric(metricXml) : undefined;
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
    const scope = scopeToData(xml, 'PriceLineResult');
    const lineXml = findFirstTagBlock(scope, 'PriceLine');
    const priceLine = lineXml ? mapPriceLine(lineXml) : undefined;
    return { priceLine, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePriceLineListResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'PriceLineListResult');
    const list = findAllTagBlocks(scope, 'PriceLine').map(mapPriceLine);
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
