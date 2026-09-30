// Browser preview: a new tab (react-native-web would replace the preview page itself for tel:).
export const openOutside = async (url: string): Promise<void> => { window.open(url, '_blank', 'noopener'); };
