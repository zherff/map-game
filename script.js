// ========================================
// HECTREK
// Polygon-first version
// ========================================
//
// New workflow:
//
// 1. Press "Draw boundary"
// 2. Click points around the town / area
// 3. Press "Finish boundary"
// 4. Hectrek creates 100m × 100m cells inside it
// 5. The area and its progress are saved
//
// You can then draw another separate area.
// ========================================



// ========================================
// 1. GAME SETTINGS
// ========================================

// Each square is 100 metres × 100 metres.
//
// 100m × 100m = 10,000 square metres = 1 hectare.
const cellSize = 100;


// Approximate number of metres in one degree
// of latitude.
//
// This is accurate enough for our current
// local-scale Hectrek prototype.
const metresPerDegree = 111320;


// Height of one hectare cell in degrees latitude.
const latitudeStep =
  cellSize / metresPerDegree;


// We use a NEW storage name because the structure
// of our areas has completely changed.
//
// This also means your older experimental data
// is left untouched.
const areasStorageKey =
  "hectrekPolygonAreas";



// ========================================
// 2. LOAD SAVED AREAS
// ========================================
//
// Each area now looks roughly like:
//
// {
//   id: "123456789",
//   boundaryPoints: [
//     [latitude, longitude],
//     [latitude, longitude],
//     ...
//   ],
//
//   cellIds: [
//     "160000,-1234",
//     "160000,-1235",
//     ...
//   ],
//
//   collectedCellIds: [
//     "160000,-1234"
//   ]
// }
//
// The important difference is:
//
// THE POLYGON defines the area.
//
// We no longer store a centre point and
// automatically create a 27 × 27 square.
// ========================================

let areas = [];

const savedAreas =
  localStorage.getItem(areasStorageKey);

if (savedAreas !== null) {

  try {
    areas = JSON.parse(savedAreas);
  } catch (error) {

    console.log(
      "Could not load saved Hectrek areas:",
      error
    );

    areas = [];
  }
}



// ========================================
// 3. FIND OUR HTML ELEMENTS
// ========================================

const startWalkButton =
  document.getElementById("startWalkButton");

const stopWalkButton =
  document.getElementById("stopWalkButton");

const recentreButton =
  document.getElementById("recentreButton");

const drawBoundaryButton =
  document.getElementById("drawBoundaryButton");

const finishBoundaryButton =
  document.getElementById("finishBoundaryButton");

const resetButton =
  document.getElementById("resetButton");

const squareCount =
  document.getElementById("squareCount");

const trackingStatus =
  document.getElementById("trackingStatus");

const resetAreasButton =
  document.getElementById("resetAreasButton");


const hector =
  document.getElementById("hector");

const hectorMessage =
  document.getElementById("hectorMessage");

// This was the old "Add area" button.
//
// We don't need it anymore because drawing
// the polygon now creates the area.
//
// This hides it if it is still in index.html.
// You can delete the button from HTML later.
const oldChooseAreaButton =
  document.getElementById("chooseAreaButton");

if (oldChooseAreaButton !== null) {
  oldChooseAreaButton.style.display = "none";
}



// ========================================
// 4. APP STATE
// ========================================

// ID returned by watchPosition().
//
// null means continuous GPS tracking is off.
let watchId = null;


// Latest real GPS coordinates.
let currentLatitude = null;
let currentLongitude = null;


// Should the map automatically follow
// the player?
let followPlayer = false;


// Used so pressing Start walk zooms to the
// player's position on the first GPS update.
let centreOnFirstPosition = false;


// Are map clicks currently being used to
// draw a new polygon?
let drawingBoundary = false;


// Temporary points for the polygon currently
// being drawn.
//
// These do NOT become a saved area until
// Finish boundary is pressed.
let boundaryPoints = [];


// Every visible playable hectare rectangle.
//
// GPS collection checks these.
let mapCells = [];


// Leaflet polygon layers belonging to
// permanently saved areas.
let areaBoundaryLayers = [];



// ========================================
// 5. CREATE THE MAP
// ========================================

const map = L.map("map");


// Start with a broad view.
//
// If saved Hectrek areas exist, we'll zoom
// to them later.
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


// The marker represents the player's REAL
// GPS location.
//
// Therefore we don't create it until GPS
// actually gives us a position.
let marker = null;



// ========================================
// 6. TEMPORARY POLYGON BEING DRAWN
// ========================================

// This polygon shows the boundary while
// the user is drawing it.
//
// It is separate from saved area polygons.
const boundaryPolygon =
  L.polygon(
    [],
    {
      fillOpacity: 0.1,
      dashArray: "6, 6"
    }
  ).addTo(map);


// Finish starts disabled because there is
// nothing to finish yet.
finishBoundaryButton.disabled = true;



// ========================================
// 7. SAVE AREAS
// ========================================

function saveAreas() {

  localStorage.setItem(
    areasStorageKey,
    JSON.stringify(areas)
  );
}



// ========================================
// 8. GLOBAL HECTARE GRID
// ========================================
//
// This is an important change.
//
// Previously every area generated its own grid
// from its own centre.
//
// That meant two grids could overlap but have
// slightly different square positions.
//
// Now every hectare belongs to ONE shared
// invisible global grid.
//
// This means the same location always produces
// the same cell ID.
//
// Therefore two areas cannot accidentally create
// two different hectare cells over the same place.
// ========================================


// Find the global grid row containing a latitude.
function getRowForLatitude(latitude) {

  return Math.floor(
    (latitude + 90) / latitudeStep
  );
}



// Find the centre latitude of a grid row.
function getLatitudeForRow(row) {

  return (
    -90 +
    (row + 0.5) * latitudeStep
  );
}



// Longitude distances change depending on
// latitude.
//
// This calculates how many degrees longitude
// approximately equal 100 metres at a
// particular latitude.
function getLongitudeStep(latitude) {

  return (
    cellSize /
    (
      metresPerDegree *
      Math.cos(
        latitude * Math.PI / 180
      )
    )
  );
}



// Find the global column containing a longitude
// for a particular row.
function getColumnForLongitude(
  longitude,
  latitude
) {

  const longitudeStep =
    getLongitudeStep(latitude);

  return Math.floor(
    (longitude + 180) /
    longitudeStep
  );
}



// Find the centre longitude of a cell.
function getLongitudeForColumn(
  column,
  latitude
) {

  const longitudeStep =
    getLongitudeStep(latitude);

  return (
    -180 +
    (column + 0.5) *
    longitudeStep
  );
}



// ========================================
// 9. POINT-IN-POLYGON TEST
// ========================================
//
// This answers:
//
// "Is this particular point inside
// this polygon?"
//
// We use the centre point of each hectare.
// ========================================

function pointIsInsideBoundary(
  latitude,
  longitude,
  points
) {

  let inside = false;


  for (
    let i = 0,
        j = points.length - 1;

    i < points.length;

    j = i++
  ) {

    const latitudeI =
      points[i][0];

    const longitudeI =
      points[i][1];

    const latitudeJ =
      points[j][0];

    const longitudeJ =
      points[j][1];


    const crossesEdge =
      (
        (longitudeI > longitude) !==
        (longitudeJ > longitude)
      )
      &&
      (
        latitude <
        (
          (latitudeJ - latitudeI) *
          (longitude - longitudeI) /
          (longitudeJ - longitudeI)
          +
          latitudeI
        )
      );


    if (crossesEdge) {
      inside = !inside;
    }
  }


  return inside;
}



// ========================================
// 10. FIND WHICH HECTARES BELONG
//     INSIDE A POLYGON
// ========================================

function createCellIdsForBoundary(points) {

  // Find the rectangle surrounding the polygon.
  //
  // We only need to test hectare cells inside
  // this general region instead of checking
  // the entire planet.

  const latitudes =
    points.map(function (point) {
      return point[0];
    });

  const longitudes =
    points.map(function (point) {
      return point[1];
    });


  const minimumLatitude =
    Math.min(...latitudes);

  const maximumLatitude =
    Math.max(...latitudes);

  const minimumLongitude =
    Math.min(...longitudes);

  const maximumLongitude =
    Math.max(...longitudes);


  const firstRow =
    getRowForLatitude(minimumLatitude) - 1;

  const lastRow =
    getRowForLatitude(maximumLatitude) + 1;


  // These are hectare cells already belonging
  // to another Hectrek area.
  //
  // We will NOT create duplicates.
  const occupiedCellIds =
    new Set();


  areas.forEach(function (area) {

    area.cellIds.forEach(function (cellId) {

      occupiedCellIds.add(cellId);

    });
  });


  const newCellIds = [];


  // Work through every possible grid row
  // crossing the polygon.
  for (
    let row = firstRow;
    row <= lastRow;
    row++
  ) {

    const cellLatitude =
      getLatitudeForRow(row);


    const longitudeStep =
      getLongitudeStep(cellLatitude);


    const firstColumn =
      Math.floor(
        (minimumLongitude + 180) /
        longitudeStep
      ) - 1;


    const lastColumn =
      Math.floor(
        (maximumLongitude + 180) /
        longitudeStep
      ) + 1;


    // Now test every possible cell in this row.
    for (
      let column = firstColumn;
      column <= lastColumn;
      column++
    ) {

      const cellLongitude =
        getLongitudeForColumn(
          column,
          cellLatitude
        );


      const cellId =
        row + "," + column;


      // If another saved Hectrek area already
      // owns this hectare, skip it.
      if (
        occupiedCellIds.has(cellId)
      ) {
        continue;
      }


      // Only include the hectare if its CENTRE
      // is inside the polygon.
      if (
        pointIsInsideBoundary(
          cellLatitude,
          cellLongitude,
          points
        )
      ) {

        newCellIds.push(cellId);
      }
    }
  }


  return newCellIds;
}



// ========================================
// 11. TURN A CELL ID BACK INTO
//     GEOGRAPHICAL BOUNDS
// ========================================
//
// Example cell ID:
//
// "160000,-1234"
//
// From that we can work out exactly where
// the Leaflet rectangle belongs.
// ========================================

function getCellBounds(cellId) {

  const parts =
    cellId.split(",");


  const row =
    Number(parts[0]);

  const column =
    Number(parts[1]);


  const latitude =
    getLatitudeForRow(row);


  const longitudeStep =
    getLongitudeStep(latitude);


  const longitude =
    getLongitudeForColumn(
      column,
      latitude
    );


  const halfLatitudeStep =
    latitudeStep / 2;

  const halfLongitudeStep =
    longitudeStep / 2;


  return {
    latitude: latitude,
    longitude: longitude,

    north:
      latitude + halfLatitudeStep,

    south:
      latitude - halfLatitudeStep,

    east:
      longitude + halfLongitudeStep,

    west:
      longitude - halfLongitudeStep
  };
}



// ========================================
// 12. REMOVE CURRENT MAP GRID LAYERS
// ========================================

function removeMapLayers() {

  // Remove all hectare rectangles.
  mapCells.forEach(function (cell) {

    map.removeLayer(
      cell.rectangle
    );
  });


  mapCells = [];


  // Remove the saved polygon outlines.
  areaBoundaryLayers.forEach(
    function (polygon) {

      map.removeLayer(polygon);

    }
  );


  areaBoundaryLayers = [];
}



// ========================================
// 13. DRAW ALL SAVED AREAS
// ========================================

function renderAllAreas() {

  removeMapLayers();


  areas.forEach(function (area) {

    // ------------------------------
    // Draw this area's hectare cells
    // ------------------------------

    area.cellIds.forEach(
      function (cellId) {

        const bounds =
          getCellBounds(cellId);


        const rectangle =
          L.rectangle([
            [
              bounds.south,
              bounds.west
            ],
            [
              bounds.north,
              bounds.east
            ]
          ]).addTo(map);


        // Restore collected hectares.
        if (
          area.collectedCellIds.includes(
            cellId
          )
        ) {

          rectangle.setStyle({
            color: "rebeccapurple",
            fillColor: "rebeccapurple"
          });
        }


        mapCells.push({
          areaId: area.id,
          cellId: cellId,

          latitude:
            bounds.latitude,

          longitude:
            bounds.longitude,

          rectangle: rectangle
        });
      }
    );


    // ------------------------------
    // Draw the original town boundary
    // ------------------------------

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
  });


  updateSquareCount();
}



// ========================================
// 14. UPDATE COLLECTED COUNTER
// ========================================

function updateSquareCount() {

  let collectedTotal = 0;
  let squareTotal = 0;


  areas.forEach(function (area) {

    collectedTotal +=
      area.collectedCellIds.length;

    squareTotal +=
      area.cellIds.length;
  });


  squareCount.textContent =
    collectedTotal +
    " / " +
    squareTotal;
  
    if (
  squareTotal > 0 &&
  collectedTotal === Math.ceil(squareTotal / 2)
) {
  wakeHector("Halfway there! 50% explored!");
}
}



// ========================================
// 15. START DRAWING A NEW AREA
// ========================================

drawBoundaryButton.addEventListener(
  "click",
  function () {

    // If we're already drawing,
    // pressing the button again CANCELS it.
    if (drawingBoundary === true) {

      drawingBoundary = false;

      boundaryPoints = [];

      boundaryPolygon.setLatLngs([]);

      drawBoundaryButton.textContent =
        "Draw boundary";

      finishBoundaryButton.disabled =
        true;
    }

    // Otherwise, start drawing a new boundary.
    else {

      drawingBoundary = true;

      boundaryPoints = [];

      boundaryPolygon.setLatLngs([]);

      drawBoundaryButton.textContent =
        "Cancel drawing";

      finishBoundaryButton.disabled =
        false;

      followPlayer = false;
    }
  }
);



// ========================================
// 16. ADD POLYGON POINTS
// ========================================

map.on(
  "click",
  function (event) {

    // Ordinary map clicks do nothing.
    //
    // They only become polygon points after
    // Draw boundary has been pressed.
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
    }
  }
);



// ========================================
// 17. FINISH THE POLYGON
//     AND CREATE THE GRID
// ========================================

finishBoundaryButton.addEventListener(
  "click",
  function () {

    // A polygon needs at least three points.
    if (
      boundaryPoints.length < 3
    ) {

      console.log(
        "A boundary needs at least 3 points."
      );

      return;
    }


    drawingBoundary = false;


    // Work out exactly which hectare cells
    // belong inside the polygon.
    const newCellIds =
      createCellIdsForBoundary(
        boundaryPoints
      );


    // If every hectare inside this polygon
    // already belongs to another area,
    // don't save an empty area.
    if (
      newCellIds.length === 0
    ) {

      console.log(
        "This boundary contains no new hectare cells."
      );


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


    // Create the new permanent Hectrek area.
    const newArea = {

      id:
        Date.now().toString(),

      // Make a copy of the points.
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


    // Add it to our saved areas.
    areas.push(newArea);


    saveAreas();


    // Clear the temporary drawing.
    boundaryPoints = [];

    boundaryPolygon.setLatLngs(
      []
    );


    drawBoundaryButton.textContent =
      "Draw boundary";

    finishBoundaryButton.disabled =
      true;


    // Rebuild everything from the saved data.
    renderAllAreas();


    console.log(
      "New Hectrek area created with",
      newCellIds.length,
      "hectares."
    );
  }
);



// ========================================
// 18. CHECK THE PLAYER'S LOCATION
// ========================================

function checkPlayerLocation(
  latitude,
  longitude
) {

  // Look through the playable hectare cells.
  //
  // Cells outside all saved polygons aren't
  // in mapCells, so they cannot be collected.

  for (
    let i = 0;
    i < mapCells.length;
    i++
  ) {

    const cell =
      mapCells[i];


    const playerIsInside =
      cell.rectangle
        .getBounds()
        .contains([
          latitude,
          longitude
        ]);


    if (
      playerIsInside
    ) {

      // Find which saved area owns the cell.
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


      // Only collect a hectare once.
      if (
        !area.collectedCellIds.includes(
          cell.cellId
        )
      ) {

        area.collectedCellIds.push(
          cell.cellId
        );


        saveAreas();

        updateSquareCount();


        cell.rectangle.setStyle({
          color: "rebeccapurple",
          fillColor: "rebeccapurple"
        });
      }


      // Because our hectare grid does not
      // overlap itself, once we've found the
      // player's cell we can stop searching.
      return;
    }
  }
}



// ========================================
// 19. HANDLE GPS POSITION
// ========================================

function showPosition(position) {

  const latitude =
    position.coords.latitude;

  const longitude =
    position.coords.longitude;


  currentLatitude =
    latitude;

  currentLongitude =
    longitude;


  // Create the marker on the first
  // successful GPS reading.
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


  // First position after Start walk:
  // centre and zoom.
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

  // Later GPS updates:
  // follow without changing zoom.
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
// 20. GPS ERROR
// ========================================

function showLocationError(error) {

  console.log(
    "Location error:",
    error.message
  );


  trackingStatus.textContent =
    "Location unavailable";
}

// ========================================
// 20.1 HECTOR ANIMATIONS
// ====
function wakeHector(message) {

  // Play Hector's uncurling animation.
  hector.src =
    "hector_uncurl_cheer.webp";


  // When the animation has mostly finished,
  // swap to the awake Hector image.
  setTimeout(function () {

    hector.src =
      "hector_cheer_fist.png";

    hectorMessage.textContent =
      message;

    hectorMessage.style.display =
      "block";

  }, 2000);


  // After a few seconds, hide the message
  // and curl Hector back up.
  setTimeout(function () {

    hectorMessage.style.display =
      "none";

    hector.src =
      "hector-curled.png";

  }, 6000);
}


// ========================================
// 21. START WALK
// ========================================

startWalkButton.addEventListener(
  "click",
  function () {

    if (
      watchId === null
    ) {

      followPlayer = true;

      centreOnFirstPosition =
        true;


      watchId =
        navigator.geolocation
          .watchPosition(
            showPosition,
            showLocationError,
            {
              enableHighAccuracy: true,
              maximumAge: 5000,
              timeout: 15000
            }
          );


      trackingStatus.textContent =
        "On";
    }
  }
);



// ========================================
// 22. STOP WALK
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

      followPlayer = false;


      trackingStatus.textContent =
        "Off";
    }
  }
);



// ========================================
// 23. RECENTRE
// ========================================

recentreButton.addEventListener(
  "click",
  function () {

    // If continuous tracking is already running
    // and we know where the player is, use that.
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


      followPlayer = true;
    }

    // Otherwise ask GPS for one fresh position.
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
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 15000
          }
        );
    }
  }
);



// ========================================
// 24. MANUALLY MOVING THE MAP
// ========================================

// If the player drags or zooms, stop
// automatically following their marker.
//
// GPS collection keeps running.
map.on(
  "dragstart",
  function () {

    followPlayer = false;
  }
);


map.on(
  "zoomstart",
  function () {

    followPlayer = false;
  }
);



// ========================================
// 25. RESET COLLECTED PROGRESS
// ========================================
//
// This does NOT delete the polygon areas.
//
// It only turns collected hectares back
// into uncollected hectares.
// ========================================

if (
  resetButton !== null
) {

  resetButton.addEventListener(
    "click",
    function () {

      areas.forEach(
        function (area) {

          area.collectedCellIds = [];

        }
      );


      saveAreas();

      renderAllAreas();
    }
  );
}

//========================================
// 25.1 RESET GRID POLYGONS
// ========================================
resetAreasButton.addEventListener("click", function () {

  const userIsSure = confirm(
    "Delete every Hectrek area and all collected progress?"
  );

  if (userIsSure === true) {

    areas = [];

    saveAreas();

    renderAllAreas();

    boundaryPoints = [];

    boundaryPolygon.setLatLngs([]);

    drawingBoundary = false;

    drawBoundaryButton.textContent =
      "Draw boundary";

    finishBoundaryButton.disabled =
      true;
  }
});

// ========================================
// 26. LOAD EVERYTHING WHEN HECTREK STARTS
// ========================================

renderAllAreas();



// If we already have saved areas, zoom the
// map so they are visible after refreshing.
if (
  areas.length > 0
) {

  const allBoundaryPoints = [];


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
        padding: [20, 20]
      }
    );
  }
}