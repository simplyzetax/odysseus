import xmlParser from 'xml-parser';
import xmlbuilder from 'xmlbuilder';

/**
 * Parses an XML string into a structured object.
 *
 * @param xmlString The XML string to parse.
 * @returns The parsed XML object.
 */
export function parseXML(xmlString: string): xmlParser.Document {
	const parsed = xmlParser(xmlString);
	return parsed;
}

/**
 * Creates an XML builder instance.
 *
 * @param rootName The name of the root element.
 * @returns An xmlbuilder instance.
 */
export function buildXML(rootName: string) {
	return xmlbuilder.create(rootName);
}
