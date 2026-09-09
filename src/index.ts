// Billing Doctor: library entry point.
//
// The CLI and the MCP server both call into what is exported from here, so a
// behaviour that a test can reach through this file is the behaviour users get.
// Nothing in this package opens a network connection unless the developer
// passes --fetch with their own credentials (built last, documented as optional).

export const VERSION = '0.1.0';
