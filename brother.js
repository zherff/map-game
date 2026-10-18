// ========================================
// LOAD SAVED PROGRESS
// ========================================

// Ask localStorage whether we already have collected squares saved.
let savedSquares = localStorage.getItem("brotherCollectedSquares");

let brotherCollectedSquares;

// If there is no saved progress, start with an empty list.
// Otherwise, turn the saved JSON text back into an array.
if (savedSquares === null) {
  brotherCollectedSquares = [];
} else {
  brotherCollectedSquares = JSON.parse(savedSquares);
}
// ========================================
// Grid area settings
// ========================================

const cellSize = 100;
const gridRadius = 9;
const gridWidth = gridRadius * 2 + 1;
const halfCellSize = cellSize / 2;
const totalSquares = gridWidth * gridWidth;

// Fixed centre point for our game grid. 53.95825237843469, -1.0807407805782685
const gridLatitude = 53.958;
const gridLongitude = -1.080;

let watchId = null;

let followPlayer = false; 
// ========================================
// FIND THE HTML ELEMENTS WE NEED
// ========================================

const startWalkButton = document.getElementById("startWalkButton");
const stopWalkButton = document.getElementById("stopWalkButton");
//const testLocationButton = document.getElementById("testLocationButton");
const resetButton = document.getElementById("resetButton");
const squareCount = document.getElementById("squareCount");
const trackingStatus = document.getElementById("trackingStatus");
const recentreButton = document.getElementById("recentreButton");
// Show the correct saved count when the page first loads.
squareCount.textContent = brotherCollectedSquares.length + " / " + totalSquares;


// ========================================
// SET UP THE MAP
// ========================================


// Create the Leaflet map.
const map = L.map("map");

// Start with the map centred on our grid.
map.setView([gridLatitude, gridLongitude], 14);

// Add OpenStreetMap map tiles.
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Create the marker that represents the player's location.
const marker = L.marker([gridLatitude, gridLongitude]);
marker.addTo(map);


// ========================================
// CREATE THE FIXED GEOGRAPHIC GRID
// ========================================



// Convert half a cell from metres into latitude/longitude offsets.
const gridLatitudeOffset = halfCellSize / 111320;

const gridLongitudeOffset =
  halfCellSize /
  (111320 * Math.cos(gridLatitude * Math.PI / 180));

// Distance between the centres of neighbouring cells.
const cellLatitudeStep = cellSize / 111320;

const cellLongitudeStep =
  cellSize /
  (111320 * Math.cos(gridLatitude * Math.PI / 180));

// Store all Leaflet grid cells here so we can check them later.
let mapCells = [];

// Create a grid. 
for (let row = -gridRadius; row <= gridRadius; row++) {
  for (let column = -gridRadius; column <= gridRadius; column++) {

    // Give this cell a permanent ID, such as "0,0" or "-1,1".
    const cellId = row + "," + column;

    // Calculate the centre point of this cell.
    const cellLatitude =
      gridLatitude - row * cellLatitudeStep;

    const cellLongitude =
      gridLongitude + column * cellLongitudeStep;

    // Calculate the four boundaries of this cell.
    const north = cellLatitude + gridLatitudeOffset;
    const south = cellLatitude - gridLatitudeOffset;
    const east = cellLongitude + gridLongitudeOffset;
    const west = cellLongitude - gridLongitudeOffset;

    // Draw the cell on the Leaflet map.
    const rectangle = L.rectangle([
      [south, west],
      [north, east]
    ]).addTo(map);

    // If this cell was collected previously, show it as collected.
    if (brotherCollectedSquares.includes(cellId)) {
      rectangle.setStyle({
        color: "rebeccapurple",
        fillColor: "rebeccapurple"
      });
    }

    // Remember this cell's ID and its Leaflet rectangle.
    mapCells.push({
      id: cellId,
      rectangle: rectangle
    });
  }
}


// ========================================
// CHECK WHICH CELL A LOCATION IS INSIDE
// ========================================

function checkPlayerLocation(latitude, longitude) {

  // Check the player's coordinates against every map cell.
  mapCells.forEach(function (cell) {

    if (cell.rectangle.getBounds().contains([latitude, longitude])) {

      // Only collect the cell if it has not been collected before.
      if (!brotherCollectedSquares.includes(cell.id)) {

        brotherCollectedSquares.push(cell.id);

        // Save the updated list.
        localStorage.setItem(
          "brotherCollectedSquares",
          JSON.stringify(brotherCollectedSquares)
        );

        // Update the counter.
        squareCount.textContent = brotherCollectedSquares.length + " / " + totalSquares;

        // Visually reveal/collect the cell.
        cell.rectangle.setStyle({
          color: "rebeccapurple",
          fillColor: "rebeccapurple"
        });
      }
    }
  });
}


// =====================================
// HANDLE THE PLAYER'S REAL LOCATION
// ========================================

function showPosition(position) {

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;

  // Move the player's marker.
  marker.setLatLng([latitude, longitude]);

  // Move the map view to the player.
 if (followPlayer === true) {
    map.panTo([latitude, longitude]);
  }

  // See whether the player has entered a grid cell.
  checkPlayerLocation(latitude, longitude);
}
 // map stops moving if dragged or zoomed 

map.on("dragstart", function () {
  followPlayer = false;
});

map.on("zoomstart", function () {
  followPlayer = false;
});
// ========================================
// BUTTONS AND TESTING TOOLS
// ========================================

//phone keeps sending location updates? start and stop walk button

startWalkButton.addEventListener("click", function () {
  if (watchId === null) {
    followPlayer = true;

    watchId = navigator.geolocation.watchPosition(showPosition);

    trackingStatus.textContent = "On";
  }
});

stopWalkButton.addEventListener("click", function () {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    trackingStatus.textContent = "Off";
  }
});

// Pretend the player is standing in the centre cell.
// Useful while developing without physically walking there.
//testLocationButton.addEventListener("click", function () {
//  checkPlayerLocation(gridLatitude, gridLongitude);
//});

//recentre button 
recentreButton.addEventListener("click", function () {
  map.setView(marker.getLatLng(), 16);
  followPlayer = true;
});


/* 
currently disabled - annoying on phone
// Clicking anywhere on the map also acts as a fake location.
// This is only a development/testing tool.
map.on("click", function (event) {
  const latitude = event.latlng.lat;
  const longitude = event.latlng.lng;

  checkPlayerLocation(latitude, longitude);
});
*/

// ========================================
// RESET PROGRESS
// ========================================

resetButton.addEventListener("click", function () {

  brotherCollectedSquares = [];

  localStorage.removeItem("brotherCollectedSquares");

  squareCount.textContent = brotherCollectedSquares.length;

  // Reload so all rectangles are rebuilt as uncollected.
  location.reload();
});