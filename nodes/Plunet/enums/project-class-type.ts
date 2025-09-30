/**
 * ProjectClassType enum based on Plunet API documentation
 * @see https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/ProjectClassType.html
 */
export enum ProjectClassType {
    ALL = 0,
    TRANSLATION = 1,
    INTERPRETING = 2,
}

/**
 * UI options for ProjectClassType dropdown
 */
export const ProjectClassTypeOptions: Array<{ name: string; value: number }> = [
    { name: 'All (0)', value: ProjectClassType.ALL },
    { name: 'Translation (1)', value: ProjectClassType.TRANSLATION },
    { name: 'Interpreting (2)', value: ProjectClassType.INTERPRETING },
];

/**
 * Get the display name for a ProjectClassType value
 */
export function getProjectClassTypeName(value: number): string {
    switch (value) {
        case ProjectClassType.ALL:
            return 'All';
        case ProjectClassType.TRANSLATION:
            return 'Translation';
        case ProjectClassType.INTERPRETING:
            return 'Interpreting';
        default:
            return `Unknown (${value})`;
    }
}
