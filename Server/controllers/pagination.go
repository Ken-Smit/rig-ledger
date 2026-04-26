package controllers

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Pagination defaults defined by CLAUDE.md.
//
//   - defaultPageSize: applied when the client omits page_size.
//   - maxPageSize:     hard ceiling. Any request above this is rejected so a
//     caller cannot ask the server to materialize an arbitrarily large result
//     set (memory + Atlas read cost protection).
const (
	defaultPage     int64 = 1
	defaultPageSize int64 = 25
	maxPageSize     int64 = 100
)

// errInvalidPagination is the sentinel for any malformed page / page_size
// combination. The handler converts it to a 400 with a generic message; the
// underlying parse error is intentionally not surfaced to the client so we
// don't leak parser internals.
var errInvalidPagination = errors.New("invalid pagination parameters")

// parsePagination extracts page and page_size from the query string, applying
// defaults and validating bounds. Returned values are 1-indexed page numbers
// and a clamped page size suitable for direct use with Mongo's Skip/Limit.
//
// Rules:
//   - Missing values fall back to defaults (page=1, page_size=25).
//   - Non-numeric, zero, or negative values are rejected.
//   - page_size above maxPageSize is rejected (NOT silently clamped) so a
//     misbehaving client gets a clear signal instead of unexpected truncation.
func parsePagination(c *gin.Context) (page, size int64, err error) {
	page, err = parsePositiveInt(c.Query("page"), defaultPage)
	if err != nil {
		return 0, 0, errInvalidPagination
	}
	size, err = parsePositiveInt(c.Query("page_size"), defaultPageSize)
	if err != nil {
		return 0, 0, errInvalidPagination
	}
	if size > maxPageSize {
		return 0, 0, errInvalidPagination
	}
	return page, size, nil
}

// parsePositiveInt parses a query-string integer. Empty -> def. Anything that
// is not a strictly positive base-10 integer is rejected.
func parsePositiveInt(raw string, def int64) (int64, error) {
	if raw == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	if n <= 0 {
		return 0, errInvalidPagination
	}
	return n, nil
}

// writePaginationHeaders emits the X-Total-Count / X-Page / X-Page-Size headers
// the frontend will read once paginated UI lands. Done as headers (not a
// response envelope) so the existing JSON array shape stays unchanged and no
// client changes are needed today.
func writePaginationHeaders(c *gin.Context, total, page, size int64) {
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	c.Header("X-Page", strconv.FormatInt(page, 10))
	c.Header("X-Page-Size", strconv.FormatInt(size, 10))
}
