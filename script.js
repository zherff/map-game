// ========================================
// HECTREK
// British National Grid version
// ========================================
//
// The important change:
//
// Hectrek now does its grid maths using
// British National Grid coordinates.
//
// British National Grid uses metres.
//
// Therefore every playable cell can simply be:
//
// 100 metres east-west
// ×
// 100 metres north-south
//
// All Hectrek areas share the SAME grid.
// ========================================



// ========================================
// 1. GAME SETTINGS
// ========================================

const cellSize = 100;


// We use a new storage name because these
// cell IDs are completely different from the
// previous latitude-based grid.
//
// Your old experimental data is not deleted.
const areasStorageKey =
  "hectrekBngAreas";



// ========================================
// 2. BRITISH NATIONAL GRID SETUP
// ========================================
//
// GPS and Leaflet use longitude / latitude.
//
// British National Grid uses:
//     Easting
//     Northing
//
// Proj4 converts between them.
//
// This definition uses an approximate
// transformation between OSGB36 and WGS84.
// ========================================

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc " +
  "+lat_0=49 " +
  "+lon_0=-2 " +
  "+k=0.9996012717 " +
  "+x_0=400000 " +
  "+y_0=-100000 " +
  "+ellps=airy " +
  "+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 " +
  "+units=m " +
  "+no_defs"
);



// ========================================
// 3. COORDINATE CONVERSION FUNCTIONS
// ========================================


// Convert normal map coordinates into
// British National Grid metres.
//
// Notice that Proj4 expects:
//
// [longitude, latitude]
//
// rather than:
//
// [latitude, longitude]
function toBritishGrid(
  latitude,
  longitude
) {

  return proj4(
    "EPSG:4326",
    "EPSG:27700",
    [longitude, latitude]
  );
}



// Convert British National Grid metres back
// into normal longitude / latitude.
function fromBritishGrid(
  easting,
  northing
) {

  const result =
    proj4(
      "EPSG:27700",
      "EPSG:4326",
      [easting, northing]
    );


  return [
    result[1],
    result[0]
  ];
}



// ========================================
// 4. LOAD SAVED AREAS
// ========================================
//
// Each area looks roughly like:
//
// {
//   id: "...",
//
//   boundaryPoints: [
//     [latitude, longitude],
//     ...
//   ],
//
//   cellIds: [
//     "4602,4541",
//     "4603,4541"
//   ],
//
//   collectedCellIds: []
// }
//
// The cell ID represents a particular
// 100m square on the British National Grid.
// ========================================

let areas = [];


const savedAreas =
  localStorage.getItem(
    areasStorageKey
  );


if (
  savedAreas !== null
) {

  try {

    areas =
      JSON.parse(
        savedAreas
      );

  } catch (error) {

    console.log(
      "Could not load saved Hectrek areas:",
      error
    );

    areas = [];
  }
}



// ========================================
// 5. FIND HTML ELEMENTS
// ========================================

const startWalkButton =
  document.getElementById(
    "startWalkButton"
  );

const stopWalkButton =
  document.getElementById(
    "stopWalkButton"
  );

const recentreButton =
  document.getElementById(
    "recentreButton"
  );

const drawBoundaryButton =
  document.getElementById(
    "drawBoundaryButton"
  );

const finishBoundaryButton =
  document.getElementById(
    "finishBoundaryButton"
  );

const resetButton =
  document.getElementById(
    "resetButton"
  );

const resetAreasButton =
  document.getElementById(
    "resetAreasButton"
  );

const squareCount =
  document.getElementById(
    "squareCount"
  );

const trackingStatus =
  document.getElementById(
    "trackingStatus"
  );

const hector =
  document.getElementById(
    "hector"
  );

const hectorMessage =
  document.getElementById(
    "hectorMessage"
  );



// ========================================
// 6. APP STATE
// ========================================

let watchId = null;

let currentLatitude = null;
let currentLongitude = null;

let followPlayer = false;

let centreOnFirstPosition = false;

let drawingBoundary = false;

let boundaryPoints = [];


// Every visible hectare rectangle.
let mapCells = [];


// This lets us find a hectare immediately
// from its cell ID.
//
// Much faster than checking every rectangle.
let cellLookup =
  new Map();


// Saved polygon outlines.
let areaBoundaryLayers = [];



// ========================================
// 7. CREATE MAP
// ========================================

const map =
  L.map("map");


map.setView(
  [54.5, -3],
  6
);


L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,

    attribution:
      "&copy; OpenStreetMap contributors"
  }
).addTo(map);


let marker = null;



// ========================================
// 8. TEMPORARY DRAWING POLYGON
// ========================================

const boundaryPolygon =
  L.polygon(
    [],
    {
      fillOpacity: 0.1,
      dashArray: "6, 6"
    }
  ).addTo(map);


finishBoundaryButton.disabled =
  true;



// ========================================
// 9. SAVE AREAS
// ========================================

function saveAreas() {

  localStorage.setItem(
    areasStorageKey,
    JSON.stringify(areas)
  );
}



// ========================================
// 10. CELL IDS
// ========================================
//
// British National Grid coordinates might be:
//
// Easting:  460250
// Northing: 454150
//
// Dividing by 100 tells us which
// 100m × 100m square we're in.
//
// Example:
//
// 460250 / 100 = cell column 4602
// 454150 / 100 = cell row    4541
//
// So the cell ID becomes:
//
// "4602,4541"
// ========================================

function getCellId(
  easting,
  northing
) {

  const column =
    Math.floor(
      easting / cellSize
    );

  const row =
    Math.floor(
      northing / cellSize
    );


  return (
    column +
    "," +
    row
  );
}



// ========================================
// 11. GET CELL GRID COORDINATES
// ========================================

function getCellGridCoordinates(
  cellId
) {

  const parts =
    cellId.split(",");


  const column =
    Number(parts[0]);

  const row =
    Number(parts[1]);


  return {
    column: column,
    row: row,

    west:
      column * cellSize,

    east:
      column * cellSize +
      cellSize,

    south:
      row * cellSize,

    north:
      row * cellSize +
      cellSize,

    centreEasting:
      column * cellSize +
      cellSize / 2,

    centreNorthing:
      row * cellSize +
      cellSize / 2
  };
}



// ========================================
// 12. POINT INSIDE POLYGON
// ========================================
//
// This version works in British National
// Grid metres.
//
// x = easting
// y = northing
// ========================================

function pointIsInsidePolygon(
  x,
  y,
  polygonPoints
) {

  let inside = false;


  for (
    let i = 0,
        j =
          polygonPoints.length - 1;

    i < polygonPoints.length;

    j = i++
  ) {

    const xI =
      polygonPoints[i][0];

    const yI =
      polygonPoints[i][1];

    const xJ =
      polygonPoints[j][0];

    const yJ =
      polygonPoints[j][1];


    const crossesEdge =
      (
        (yI > y) !==
        (yJ > y)
      )
      &&
      (
        x <
        (
          (xJ - xI) *
          (y - yI) /
          (yJ - yI)
          +
          xI
        )
      );


    if (
      crossesEdge
    ) {

      inside =
        !inside;
    }
  }


  return inside;
}



// ========================================
// 13. CREATE CELLS FOR A BOUNDARY
// ========================================

function createCellIdsForBoundary(
  points
) {

  // Convert every polygon point from
  // latitude / longitude into metre-based
  // British National Grid coordinates.

  const gridBoundary =
    points.map(
      function (point) {

        return toBritishGrid(
          point[0],
          point[1]
        );
      }
    );


  const eastings =
    gridBoundary.map(
      function (point) {
        return point[0];
      }
    );


  const northings =
    gridBoundary.map(
      function (point) {
        return point[1];
      }
    );


  const minimumEasting =
    Math.min(...eastings);

  const maximumEasting =
    Math.max(...eastings);

  const minimumNorthing =
    Math.min(...northings);

  const maximumNorthing =
    Math.max(...northings);


  // Work out which grid columns and rows
  // cover the polygon.

  const firstColumn =
    Math.floor(
      minimumEasting /
      cellSize
    );


  const lastColumn =
    Math.floor(
      maximumEasting /
      cellSize
    );


  const firstRow =
    Math.floor(
      minimumNorthing /
      cellSize
    );


  const lastRow =
    Math.floor(
      maximumNorthing /
      cellSize
    );


  // Make a set containing every hectare
  // already owned by another area.

  const occupiedCellIds =
    new Set();


  areas.forEach(
    function (area) {

      area.cellIds.forEach(
        function (cellId) {

          occupiedCellIds.add(
            cellId
          );

        }
      );
    }
  );


  const newCellIds = [];


  // Check every possible 100m cell within
  // the rectangle surrounding our polygon.

  for (
    let column = firstColumn;
    column <= lastColumn;
    column++
  ) {

    for (
      let row = firstRow;
      row <= lastRow;
      row++
    ) {

      const cellId =
        column +
        "," +
        row;


      // Don't create the same hectare twice.

      if (
        occupiedCellIds.has(
          cellId
        )
      ) {

        continue;
      }


      // Find the exact centre of this hectare
      // in British National Grid metres.

      const centreEasting =
        column * cellSize +
        cellSize / 2;


      const centreNorthing =
        row * cellSize +
        cellSize / 2;


      // If the centre is inside the drawn
      // polygon, this hectare belongs to
      // the new Hectrek area.

      if (
        pointIsInsidePolygon(
          centreEasting,
          centreNorthing,
          gridBoundary
        )
      ) {

        newCellIds.push(
          cellId
        );
      }
    }
  }


  return newCellIds;
}



// ========================================
// 14. CONVERT A HECTARE INTO MAP CORNERS
// ========================================

function getCellMapCorners(
  cellId
) {

  const grid =
    getCellGridCoordinates(
      cellId
    );


  // These four corners are genuinely aligned
  // on the same British National Grid.

  const southWest =
    fromBritishGrid(
      grid.west,
      grid.south
    );


  const northWest =
    fromBritishGrid(
      grid.west,
      grid.north
    );


  const northEast =
    fromBritishGrid(
      grid.east,
      grid.north
    );


  const southEast =
    fromBritishGrid(
      grid.east,
      grid.south
    );


  return [
    southWest,
    northWest,
    northEast,
    southEast
  ];
}



// ========================================
// 15. REMOVE MAP LAYERS
// ========================================

function removeMapLayers() {

  mapCells.forEach(
    function (cell) {

      map.removeLayer(
        cell.rectangle
      );

    }
  );


  mapCells = [];

  cellLookup.clear();


  areaBoundaryLayers.forEach(
    function (polygon) {

      map.removeLayer(
        polygon
      );

    }
  );


  areaBoundaryLayers = [];
}



// ========================================
// 16. DRAW ALL SAVED AREAS
// ========================================

function renderAllAreas() {

  removeMapLayers();


  areas.forEach(
    function (area) {

      // ----------------------------
      // Draw hectare cells
      // ----------------------------

      area.cellIds.forEach(
        function (cellId) {

          const corners =
            getCellMapCorners(
              cellId
            );


          // We use L.polygon rather than
          // L.rectangle because the corners
          // have been converted from the
          // British National Grid projection.

          const rectangle =
            L.polygon(
              corners
            ).addTo(map);


          if (
            area.collectedCellIds
              .includes(cellId)
          ) {

            rectangle.setStyle({
              color:
                "rebeccapurple",

              fillColor:
                "rebeccapurple"
            });
          }


          const cell = {
            areaId:
              area.id,

            cellId:
              cellId,

            rectangle:
              rectangle
          };


          mapCells.push(
            cell
          );


          cellLookup.set(
            cellId,
            cell
          );
        }
      );


      // ----------------------------
      // Draw original boundary
      // ----------------------------

      const polygon =
        L.polygon(
          area.boundaryPoints,
          {
            fillOpacity: 0,
            weight: 2
          }
        ).addTo(map);


      areaBoundaryLayers.push(
        polygon
      );
    }
  );


  updateSquareCount();
}



// ========================================
// 17. SQUARE COUNTER
// ========================================

function getSquareTotals() {

  let collectedTotal = 0;
  let squareTotal = 0;


  areas.forEach(
    function (area) {

      collectedTotal +=
        area.collectedCellIds.length;

      squareTotal +=
        area.cellIds.length;
    }
  );


  return {
    collected:
      collectedTotal,

    total:
      squareTotal
  };
}



function updateSquareCount() {

  const totals =
    getSquareTotals();


  squareCount.textContent =
    totals.collected +
    " / " +
    totals.total;
}



// ========================================
// 18. HECTOR
// ========================================

function wakeHector(
  message
) {

  if (
    hector === null ||
    hectorMessage === null
  ) {

    return;
  }


  // Play uncurl animation.

  hector.src =
    "hector_uncurl_cheer.webp";


  // Then show awake Hector and message.

  setTimeout(
    function () {

      hector.src =
        "hector_cheer_fist.png";


      hectorMessage.textContent =
        message;


      hectorMessage.style.display =
        "block";

    },
    2000
  );


  // Curl back up later.

  setTimeout(
    function () {

      hectorMessage.style.display =
        "none";


      hector.src =
        "hector-curled.png";

    },
    6000
  );
}



// ========================================
// 19. ACHIEVEMENTS
// ========================================

function checkAchievements() {

  const totals =
    getSquareTotals();


  if (
    totals.total > 0 &&
    totals.collected ===
      Math.ceil(
        totals.total / 2
      )
  ) {

    wakeHector(
      "Halfway there! 50% explored!"
    );
  }
}



// ========================================
// 20. DRAW / CANCEL BOUNDARY
// ========================================

drawBoundaryButton.addEventListener(
  "click",
  function () {

    // Already drawing?
    //
    // Pressing again means CANCEL.

    if (
      drawingBoundary === true
    ) {

      drawingBoundary = false;

      boundaryPoints = [];

      boundaryPolygon.setLatLngs(
        []
      );

      drawBoundaryButton.textContent =
        "Draw boundary";

      finishBoundaryButton.disabled =
        true;
    }


    // Otherwise start drawing.

    else {

      drawingBoundary = true;

      boundaryPoints = [];

      boundaryPolygon.setLatLngs(
        []
      );

      drawBoundaryButton.textContent =
        "Cancel drawing";

      // Finish stays disabled until the user
      // has created at least 3 points.

      finishBoundaryButton.disabled =
        true;

      followPlayer = false;
    }
  }
);



// ========================================
// 21. ADD BOUNDARY POINTS
// ========================================

map.on(
  "click",
  function (event) {

    if (
      drawingBoundary === true
    ) {

      const latitude =
        event.latlng.lat;

      const longitude =
        event.latlng.lng;


      boundaryPoints.push([
        latitude,
        longitude
      ]);


      boundaryPolygon.setLatLngs(
        boundaryPoints
      );


      // Three points are the minimum
      // required to make a polygon.

      finishBoundaryButton.disabled =
        boundaryPoints.length < 3;
    }
  }
);



// ========================================
// 22. FINISH BOUNDARY
// ========================================

finishBoundaryButton.addEventListener(
  "click",
  function () {

    if (
      boundaryPoints.length < 3
    ) {

      return;
    }


    const newCellIds =
      createCellIdsForBoundary(
        boundaryPoints
      );


    // If the entire polygon overlaps cells
    // that already belong to other areas,
    // don't create an empty area.

    if (
      newCellIds.length === 0
    ) {

      console.log(
        "This boundary contains no new hectare cells."
      );


      drawingBoundary = false;

      boundaryPoints = [];

      boundaryPolygon.setLatLngs(
        []
      );

      drawBoundaryButton.textContent =
        "Draw boundary";

      finishBoundaryButton.disabled =
        true;

      return;
    }


    const newArea = {

      id:
        Date.now().toString(),

      boundaryPoints:
        boundaryPoints.map(
          function (point) {

            return [
              point[0],
              point[1]
            ];
          }
        ),

      cellIds:
        newCellIds,

      collectedCellIds:
        []
    };


    areas.push(
      newArea
    );


    saveAreas();


    drawingBoundary = false;

    boundaryPoints = [];

    boundaryPolygon.setLatLngs(
      []
    );

    drawBoundaryButton.textContent =
      "Draw boundary";

    finishBoundaryButton.disabled =
      true;


    renderAllAreas();


    console.log(
      "New Hectrek area created with",
      newCellIds.length,
      "hectares."
    );
  }
);



// ========================================
// 23. CHECK PLAYER LOCATION
// ========================================
//
// This is now much simpler.
//
// Instead of checking hundreds of Leaflet
// rectangles, we:
//
// 1. convert GPS into British Grid metres
// 2. calculate which 100m cell we're in
// 3. look that cell up directly
// ========================================

function checkPlayerLocation(
  latitude,
  longitude
) {

  const gridPosition =
    toBritishGrid(
      latitude,
      longitude
    );


  const easting =
    gridPosition[0];

  const northing =
    gridPosition[1];


  const cellId =
    getCellId(
      easting,
      northing
    );


  const cell =
    cellLookup.get(
      cellId
    );


  // This hectare isn't part of any
  // Hectrek area.

  if (
    cell === undefined
  ) {

    return;
  }


  const area =
    areas.find(
      function (area) {

        return (
          area.id ===
          cell.areaId
        );
      }
    );


  if (
    area === undefined
  ) {

    return;
  }


  // Already collected.

  if (
    area.collectedCellIds
      .includes(cellId)
  ) {

    return;
  }


  // Collect it.

  area.collectedCellIds.push(
    cellId
  );


  saveAreas();

  updateSquareCount();


  cell.rectangle.setStyle({
    color:
      "rebeccapurple",

    fillColor:
      "rebeccapurple"
  });


  checkAchievements();
}



// ========================================
// 24. GPS POSITION
// ========================================

function showPosition(
  position
) {

  const latitude =
    position.coords.latitude;

  const longitude =
    position.coords.longitude;


  currentLatitude =
    latitude;

  currentLongitude =
    longitude;


  if (
    marker === null
  ) {

    marker =
      L.marker([
        latitude,
        longitude
      ]).addTo(map);

  } else {

    marker.setLatLng([
      latitude,
      longitude
    ]);
  }


  if (
    centreOnFirstPosition === true
  ) {

    map.setView(
      [
        latitude,
        longitude
      ],
      16
    );


    centreOnFirstPosition =
      false;
  }

  else if (
    followPlayer === true
  ) {

    map.panTo([
      latitude,
      longitude
    ]);
  }


  checkPlayerLocation(
    latitude,
    longitude
  );
}



// ========================================
// 25. GPS ERROR
// ========================================

function showLocationError(
  error
) {

  console.log(
    "Location error:",
    error.message
  );


  trackingStatus.textContent =
    "Location unavailable";
}



// ========================================
// 26. START WALK
// ========================================

startWalkButton.addEventListener(
  "click",
  function () {

    if (
      watchId === null
    ) {

      followPlayer =
        true;

      centreOnFirstPosition =
        true;


      watchId =
        navigator.geolocation
          .watchPosition(
            showPosition,
            showLocationError,
            {
              enableHighAccuracy:
                true,

              maximumAge:
                5000,

              timeout:
                15000
            }
          );


      trackingStatus.textContent =
        "On";
    }
  }
);



// ========================================
// 27. STOP WALK
// ========================================

stopWalkButton.addEventListener(
  "click",
  function () {

    if (
      watchId !== null
    ) {

      navigator.geolocation
        .clearWatch(
          watchId
        );


      watchId = null;

      followPlayer =
        false;


      trackingStatus.textContent =
        "Off";
    }
  }
);



// ========================================
// 28. RECENTRE
// ========================================

recentreButton.addEventListener(
  "click",
  function () {

    if (
      watchId !== null &&
      currentLatitude !== null &&
      currentLongitude !== null
    ) {

      map.setView(
        [
          currentLatitude,
          currentLongitude
        ],
        16
      );


      followPlayer =
        true;
    }

    else {

      navigator.geolocation
        .getCurrentPosition(

          function (position) {

            currentLatitude =
              position.coords.latitude;

            currentLongitude =
              position.coords.longitude;


            if (
              marker === null
            ) {

              marker =
                L.marker([
                  currentLatitude,
                  currentLongitude
                ]).addTo(map);

            } else {

              marker.setLatLng([
                currentLatitude,
                currentLongitude
              ]);
            }


            map.setView(
              [
                currentLatitude,
                currentLongitude
              ],
              16
            );


            followPlayer =
              true;
          },


          showLocationError,


          {
            enableHighAccuracy:
              true,

            maximumAge:
              5000,

            timeout:
              15000
          }
        );
    }
  }
);



// ========================================
// 29. MANUALLY MOVING MAP
// ========================================

map.on(
  "dragstart",
  function () {

    followPlayer =
      false;
  }
);


map.on(
  "zoomstart",
  function () {

    followPlayer =
      false;
  }
);



// ========================================
// 30. RESET PROGRESS
// ========================================

resetButton.addEventListener(
  "click",
  function () {

    const userIsSure =
      confirm(
        "Reset all collected progress?"
      );


    if (
      userIsSure === true
    ) {

      areas.forEach(
        function (area) {

          area.collectedCellIds =
            [];
        }
      );


      saveAreas();

      renderAllAreas();
    }
  }
);



// ========================================
// 31. DELETE ALL AREAS
// ========================================

resetAreasButton.addEventListener(
  "click",
  function () {

    const userIsSure =
      confirm(
        "Delete every Hectrek area and all collected progress?"
      );


    if (
      userIsSure === true
    ) {

      areas = [];


      saveAreas();


      drawingBoundary =
        false;

      boundaryPoints =
        [];

      boundaryPolygon.setLatLngs(
        []
      );


      drawBoundaryButton.textContent =
        "Draw boundary";

      finishBoundaryButton.disabled =
        true;


      renderAllAreas();
    }
  }
);



// ========================================
// 32. LOAD SAVED AREAS
// ========================================

renderAllAreas();



// Zoom so all saved areas are visible.
if (
  areas.length > 0
) {

  const allBoundaryPoints =
    [];


  areas.forEach(
    function (area) {

      area.boundaryPoints.forEach(
        function (point) {

          allBoundaryPoints.push(
            point
          );

        }
      );
    }
  );


  if (
    allBoundaryPoints.length > 0
  ) {

    map.fitBounds(
      allBoundaryPoints,
      {
        padding:
          [20, 20]
      }
    );
  }
}