/**
 * Runtime support for older WebKit builds. macOS web views use the system
 * WebKit (updated with Safari), and pdf.js 6 relies on APIs that only recent
 * Safari versions ship: iterator helpers (incl. a top-level `Iterator` check
 * that otherwise throws while the bundle loads), Promise.try/withResolvers.
 * core-js "actual" entries are no-ops where the API already exists.
 * This module must be imported before anything that pulls in pdf.js.
 */
import "core-js/actual/iterator";
import "core-js/actual/promise/try";
import "core-js/actual/promise/with-resolvers";
import "core-js/actual/array/find-last";
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-sorted";
import "core-js/actual/object/has-own";
import "core-js/actual/structured-clone";
