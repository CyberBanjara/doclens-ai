export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextSegment {
  items: TextItem[];
  minX: number;
  maxX: number;
  y: number;
}

interface DividerPoint {
  x: number;
  y: number;
}

/**
 * Detect columns by clustering text items along the X axis.
 * Returns column count (1-3 typical).
 */
export function detectColumns(items: TextItem[], pageWidth: number, yTolerance = 4): number {
  if (items.length < 20) return 1;

  const segments = groupIntoSegments(items, yTolerance);
  if (segments.length < 5) return 1;

  // Group segments into horizontal rows (within tolerance)
  const sortedSegments = [...segments].sort((a, b) => b.y - a.y);
  const rows: TextSegment[][] = [];
  const rowYTolerance = yTolerance * 2;

  for (const seg of sortedSegments) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - seg.y) <= rowYTolerance) {
        row.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([seg]);
    }
  }

  // Count how many rows have 2 segments, and how many have 3 segments
  let rowsWith2 = 0;
  let rowsWith3Plus = 0;

  for (const row of rows) {
    if (row.length === 2) {
      rowsWith2++;
    } else if (row.length >= 3) {
      rowsWith3Plus++;
    }
  }

  const totalRows = rows.length;
  const multiSegmentRows = rowsWith2 + rowsWith3Plus;

  const result = (() => {
    // If we have very few multi-segment rows, it's a 1-column page
    if (multiSegmentRows < 3 && multiSegmentRows / totalRows < 0.1) {
      return 1;
    }

    // If we have at least 2 rows with 3 or more segments, it's a 3-column page
    if (rowsWith3Plus >= 2) {
      return 3;
    }

    return 2;
  })();

  return result;
}

/**
 * Group text items that are on the same vertical line (within a small tolerance)
 * and close to each other horizontally into single line segments.
 */
function groupIntoSegments(items: TextItem[], yTolerance = 4): TextSegment[] {
  if (items.length === 0) return [];

  // Sort items by Y descending (top to bottom), then by X ascending (left to right)
  const sortedItems = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: TextItem[][] = [];

  for (const item of sortedItems) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - item.y) <= yTolerance) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([item]);
    }
  }

  const segments: TextSegment[] = [];

  for (const row of rows) {
    // Sort items in row by X coordinate
    row.sort((a, b) => a.x - b.x);

    let currentSegment: TextItem[] = [row[0]];
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const curr = row[i];
      const fontHeight = Math.max(prev.height, curr.height) || 10;
      const gapThreshold = fontHeight * 1.5; // Allow spacing up to 1.5x font size before breaking column

      const gap = curr.x - (prev.x + prev.width);
      if (gap > gapThreshold && gap > 12) {
        segments.push({
          items: currentSegment,
          minX: currentSegment[0].x,
          maxX:
            currentSegment[currentSegment.length - 1].x +
            currentSegment[currentSegment.length - 1].width,
          y: currentSegment[0].y,
        });
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }
    segments.push({
      items: currentSegment,
      minX: currentSegment[0].x,
      maxX:
        currentSegment[currentSegment.length - 1].x +
        currentSegment[currentSegment.length - 1].width,
      y: currentSegment[0].y,
    });
  }

  return segments;
}

/**
 * Sort text items respecting detected columns: group into horizontal segments,
 * calculate dynamic column dividers based on adjacent segments, and assign segments
 * to their respective columns before sorting top→bottom.
 */
export function sortByColumns(
  items: TextItem[],
  pageWidth: number,
  columns: number,
  yTolerance = 4,
): TextItem[] {
  if (columns <= 1) {
    return [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  }

  const segments = groupIntoSegments(items, yTolerance);

  // Group segments into horizontal rows to locate column dividers
  const sortedSegments = [...segments].sort((a, b) => b.y - a.y);
  const rows: TextSegment[][] = [];
  const rowYTolerance = yTolerance * 2; // pixels

  for (const seg of sortedSegments) {
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row[0].y - seg.y) <= rowYTolerance) {
        row.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([seg]);
    }
  }

  // Collect divider points between columns
  // For columns = 2, we need 1 divider (between col 0 and 1)
  // For columns = 3, we need 2 dividers (between col 0/1 and col 1/2)
  const dividers1: DividerPoint[] = [];
  const dividers2: DividerPoint[] = [];

  for (const row of rows) {
    if (row.length >= 2) {
      row.sort((a, b) => a.minX - b.minX);
      dividers1.push({
        x: (row[0].maxX + row[1].minX) / 2,
        y: row[0].y,
      });
      if (row.length >= 3) {
        dividers2.push({
          x: (row[1].maxX + row[2].minX) / 2,
          y: row[1].y,
        });
      }
    }
  }

  // Helper to find the closest divider X coordinate at a given Y coordinate
  const getDividerX = (y: number, dividerPoints: DividerPoint[], defaultX: number): number => {
    if (dividerPoints.length === 0) return defaultX;

    // Get all divider points within a vertical window of 150px
    const windowSize = 150;
    const pointsInWindow = dividerPoints.filter((p) => Math.abs(p.y - y) <= windowSize);

    if (pointsInWindow.length === 0) {
      // Fallback to nearest neighbor if window is empty
      let closest = dividerPoints[0];
      let minDist = Math.abs(closest.y - y);
      for (let i = 1; i < dividerPoints.length; i++) {
        const dist = Math.abs(dividerPoints[i].y - y);
        if (dist < minDist) {
          minDist = dist;
          closest = dividerPoints[i];
        }
      }
      return closest.x;
    }

    // Sort the X coordinates of points in the window and take the median
    const xs = pointsInWindow.map((p) => p.x).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    if (xs.length % 2 === 0) {
      return (xs[mid - 1] + xs[mid]) / 2;
    } else {
      return xs[mid];
    }
  };

  const bands: TextSegment[][] = Array.from({ length: columns }, () => []);

  for (const segment of segments) {
    let col = 0;
    if (columns === 2) {
      const divX = getDividerX(segment.y, dividers1, pageWidth / 2);
      col = segment.minX < divX ? 0 : 1;
    } else if (columns === 3) {
      const divX1 = getDividerX(segment.y, dividers1, pageWidth / 3);
      const divX2 = getDividerX(segment.y, dividers2, (2 * pageWidth) / 3);
      if (segment.minX < divX1) {
        col = 0;
      } else if (segment.minX < divX2) {
        col = 1;
      } else {
        col = 2;
      }
    } else {
      // Fallback for more than 3 columns
      const bandWidth = pageWidth / columns;
      col = Math.min(columns - 1, Math.floor(segment.minX / bandWidth));
    }
    bands[col].push(segment);
  }

  const sortedItems: TextItem[] = [];
  for (const band of bands) {
    band.sort((a, b) => b.y - a.y);
    for (const segment of band) {
      // Sort items within each segment left-to-right
      segment.items.sort((a, b) => a.x - b.x);
      sortedItems.push(...segment.items);
    }
  }
  return sortedItems;
}
