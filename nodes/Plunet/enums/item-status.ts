/**
 * ItemStatus enum based on Plunet API documentation
 * @see https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/ItemStatus.html
 */
export enum ItemStatus {
    IN_PROGRESS = 1,
    DELIVERED = 2,
    APPROVED = 3,
    INVOICED = 4,
    CANCELED = 5,
    NEW_AUTO = 6,
    DELIVERABLE = 7,
    IN_PREPERATION = 8,
    PAID = 9,
    WITHOUT_INVOICE = 10,
    PENDING = 11,
    ACCEPTED = 12,
    REJECTED = 13,
    SUM = 14,
}

/**
 * UI options for ItemStatus dropdown
 */
export const ItemStatusOptions: Array<{ name: string; value: number }> = [
    { name: 'In Progress (1)', value: ItemStatus.IN_PROGRESS },
    { name: 'Delivered (2)', value: ItemStatus.DELIVERED },
    { name: 'Approved (3)', value: ItemStatus.APPROVED },
    { name: 'Invoiced (4)', value: ItemStatus.INVOICED },
    { name: 'Canceled (5)', value: ItemStatus.CANCELED },
    { name: 'New Auto (6)', value: ItemStatus.NEW_AUTO },
    { name: 'Deliverable (7)', value: ItemStatus.DELIVERABLE },
    { name: 'In Preparation (8)', value: ItemStatus.IN_PREPERATION },
    { name: 'Paid (9)', value: ItemStatus.PAID },
    { name: 'Without Invoice (10)', value: ItemStatus.WITHOUT_INVOICE },
    { name: 'Pending (11)', value: ItemStatus.PENDING },
    { name: 'Accepted (12)', value: ItemStatus.ACCEPTED },
    { name: 'Rejected (13)', value: ItemStatus.REJECTED },
    { name: 'Sum (14)', value: ItemStatus.SUM },
];

/**
 * Get the display name for an ItemStatus value
 */
export function getItemStatusName(value: number): string {
    switch (value) {
        case ItemStatus.IN_PROGRESS:
            return 'In Progress';
        case ItemStatus.DELIVERED:
            return 'Delivered';
        case ItemStatus.APPROVED:
            return 'Approved';
        case ItemStatus.INVOICED:
            return 'Invoiced';
        case ItemStatus.CANCELED:
            return 'Canceled';
        case ItemStatus.NEW_AUTO:
            return 'New Auto';
        case ItemStatus.DELIVERABLE:
            return 'Deliverable';
        case ItemStatus.IN_PREPERATION:
            return 'In Preparation';
        case ItemStatus.PAID:
            return 'Paid';
        case ItemStatus.WITHOUT_INVOICE:
            return 'Without Invoice';
        case ItemStatus.PENDING:
            return 'Pending';
        case ItemStatus.ACCEPTED:
            return 'Accepted';
        case ItemStatus.REJECTED:
            return 'Rejected';
        case ItemStatus.SUM:
            return 'Sum';
        default:
            return `Unknown (${value})`;
    }
}
