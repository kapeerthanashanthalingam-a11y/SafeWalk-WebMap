var map = L.map('map').setView([6.9271,79.8612],9);

L.tileLayer(
'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
{
attribution:'© OpenStreetMap contributors'
}
).addTo(map);
