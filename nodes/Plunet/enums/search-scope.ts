/**
 * SearchScope enum based on Plunet API documentation
 * @see https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/SearchScope.html
 */
export enum SearchScope {
    DATE_OF_ORDER = 1,
    ITEM_CREATION_DATE = 2,
    ORDER_DUE_DATE = 3,
    ITEM_DUE_DATE = 4,
    ITEM_DELIVERED_ON = 5,
    INSTALLMENT_DATE = 6,
    START_DATE_EVENT = 7,
    END_DATE_EVENT = 8,
    ORDER_CLOSING_DATE = 9,
}

/**
 * UI options for SearchScope dropdown
 */
export const SearchScopeOptions: Array<{ name: string; value: number }> = [
    { name: 'Date of Order (1)', value: SearchScope.DATE_OF_ORDER },
    { name: 'Item Creation Date (2)', value: SearchScope.ITEM_CREATION_DATE },
    { name: 'Order Due Date (3)', value: SearchScope.ORDER_DUE_DATE },
    { name: 'Item Due Date (4)', value: SearchScope.ITEM_DUE_DATE },
    { name: 'Item Delivered On (5)', value: SearchScope.ITEM_DELIVERED_ON },
    { name: 'Installment Date (6)', value: SearchScope.INSTALLMENT_DATE },
    { name: 'Start Date Event (7)', value: SearchScope.START_DATE_EVENT },
    { name: 'End Date Event (8)', value: SearchScope.END_DATE_EVENT },
    { name: 'Order Closing Date (9)', value: SearchScope.ORDER_CLOSING_DATE },
];

/**
 * Get the display name for a SearchScope value
 */
export function getSearchScopeName(value: number): string {
    switch (value) {
        case SearchScope.DATE_OF_ORDER:
            return 'Date of Order';
        case SearchScope.ITEM_CREATION_DATE:
            return 'Item Creation Date';
        case SearchScope.ORDER_DUE_DATE:
            return 'Order Due Date';
        case SearchScope.ITEM_DUE_DATE:
            return 'Item Due Date';
        case SearchScope.ITEM_DELIVERED_ON:
            return 'Item Delivered On';
        case SearchScope.INSTALLMENT_DATE:
            return 'Installment Date';
        case SearchScope.START_DATE_EVENT:
            return 'Start Date Event';
        case SearchScope.END_DATE_EVENT:
            return 'End Date Event';
        case SearchScope.ORDER_CLOSING_DATE:
            return 'Order Closing Date';
        default:
            return `Unknown (${value})`;
    }
}
