// The permitted fields total about 17K UTF-16 code units. Leave room for JSON
// escapes (up to six bytes per unit), URL normalization, and serialization keys.
export const PLUGIN_LAB_MAX_SERIALIZED_BYTES = 128 * 1024;
