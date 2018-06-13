import React from 'react';
import L from 'leaflet';
import {
  Map,
  TileLayer,
  Marker,
  GeoJSON,
  CircleMarker,
  Popup
} from 'react-leaflet';
import CustomLayerGroup from 'components/CustomLayerGroup';
import {
  LINE_PROPERTIES,
  LINE_DRAW_ORDER,
  LINE_NAMES
} from 'common/constants/lines';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import {
  fetchTrains,
  fetchRailStations,
  fetchRailLines,
  setSelectedRailStations
} from 'actions/metro';
import 'leaflet/dist/leaflet.css';
import './style.scss';
import TrainMarker from 'components/TrainMarker';
import { nearestPointOnLine, lineString, point } from '@turf/turf';

// https://github.com/PaulLeCam/react-leaflet/issues/255#issuecomment-269750542
// The webpack bundling step can't find these images
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

//  Workaround for 1px lines appearing in Chrome due to fractional transforms
//  and resulting anti-aliasing.
//  https://github.com/Leaflet/Leaflet/issues/3575
if (window.navigator.userAgent.indexOf('Chrome') > -1) {
  var originalInitTile = L.GridLayer.prototype._initTile;
  L.GridLayer.include({
    _initTile: function(tile) {
      originalInitTile.call(this, tile);
      var tileSize = this.getTileSize();
      tile.style.width = tileSize.x + 1 + 'px';
      tile.style.height = tileSize.y + 1 + 'px';
    }
  });
}

//const weights = [2, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 6, 6, 7, 7, 7];
const scaleMultiples = [
  -0.3,
  -0.3,
  -0.3,
  -0.2,
  -0.1,
  -0.05,
  -0.03,
  -0.015,
  -0.008,
  -0.0045,
  -0.0023,
  -0.006,
  -0.003,
  -0.0015,
  -0.0008,
  -0.0004,
  -0.0001,
  -0.00008,
  -0.00008
];

const offsetLatLngs = (latLngs, zoom) => {
  const first = latLngs[0];
  const last = latLngs[latLngs.length - 1];
  let dx = first[1] - last[1];
  let dy = first[0] - last[0];
  if (dx === 0 && dy === 0) {
    // Let's avoid division by 0
    return latLngs;
  }
  const vectorLength = Math.sqrt(dx * dx + dy * dy);
  dx = dx / vectorLength;
  dy = dy / vectorLength;
  const latMult = dx;
  const lngMult = -1 * dy;
  const scaleMultiple = scaleMultiples[zoom];
  const offsetLat = scaleMultiple * latMult;
  const offsetLng = scaleMultiple * lngMult;
  const newLatLngs = latLngs.map(([lat, lng]) => {
    return [lat + offsetLat, lng + offsetLng];
  });
  return newLatLngs;
};

class MetroMap extends React.Component {
  state = {
    railStationsLayerGroup: null,
    railLinesLayerGroup: null,
    trainsLayerGroup: null,
    layersNeedOrdering: true,
    leafletMapElt: false,
    zoom: 12
  };

  componentWillUpdate(nextProps, nextState) {
    const {
      railStationsLayerGroup,
      railLinesLayerGroup,
      trainsLayerGroup,
      layersNeedOrdering,
      leafletMapElt
    } = nextState;
    if (
      layersNeedOrdering &&
      leafletMapElt &&
      railStationsLayerGroup &&
      railLinesLayerGroup &&
      trainsLayerGroup
    ) {
      this.orderLayers(nextState);
    }
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.visibleRailLines !== this.props.visibleRailLines &&
      this.state.railLinesLayerGroup
    ) {
      this.state.railStationsLayerGroup.getLayers().forEach(layer => {
        layer.bringToFront();
      });
    }
  }

  componentWillMount() {
    const { fetchTrains, fetchRailStations, fetchRailLines } = this.props;
    fetchRailLines();
    fetchRailStations();
    fetchTrains();
    setInterval(fetchTrains, 5000);
  }

  orderLayers(nextState) {
    const {
      railStationsLayerGroup,
      railLinesLayerGroup,
      trainsLayerGroup
    } = nextState;
    this.setState({ layersNeedOrdering: false });
    //Ugh I give up. Fucking layers won't respect my ordering without at timeout.
    setTimeout(() => {
      [railLinesLayerGroup, railStationsLayerGroup].forEach(layerGroup => {
        layerGroup.getLayers().forEach(layer => {
          layer.bringToFront();
        });
      });
    }, 2000);
  }

  handleMapLoad = ({ target }) => {
    this.setState({ leafletMapElt: target });
  };

  handleRailStationsReady = railStationsLayerGroup => {
    this.setState({ railStationsLayerGroup });
  };

  handleRailLinesReady = railLinesLayerGroup => {
    this.setState({ railLinesLayerGroup });
  };

  handleTrainsLayerReady = trainsLayerGroup => {
    this.setState({ trainsLayerGroup });
  };

  handleStationClick = stationCode => {
    const { railStations, setSelectedRailStations } = this.props;
    const { Code, StationTogether1 } = railStations.find(
      ({ Code }) => Code === stationCode
    );
    let lineCodes = [Code];
    if (StationTogether1 !== '') {
      lineCodes.push(StationTogether1);
    }
    setSelectedRailStations(lineCodes);
  };

  render() {
    const { trains, railStations, railLines, visibleRailLines } = this.props;
    const { leafletMapElt, zoom } = this.state;
    return (
      <div className="MetroMap">
        <Map
          whenReady={this.handleMapLoad}
          center={[38.9072, -77.0369]}
          onZoomEnd={() => this.setState({ zoom: leafletMapElt.getZoom() })}
          zoom={zoom}>
          <TileLayer
            className="MapboxTileLayer"
            crossOrigin
            url="https://api.mapbox.com/styles/v1/mapbox/dark-v9/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoiamJjY29sbGlucyIsImEiOiJjamd3dXgyengwNmZnMndsbG9nYnM0Ynh6In0.oZwMIjuVePaRgp0ibE0pZg"
          />
          <CustomLayerGroup onReady={this.handleRailLinesReady}>
            {railLines &&
              [3, 2, 1].map(p => {
                return LINE_DRAW_ORDER.filter(l =>
                  visibleRailLines.includes(l)
                ).map(name => {
                  const priorities = LINE_PROPERTIES[name]['priorities'].filter(
                    ({ priority }) => priority(visibleRailLines) === p
                  );
                  const railLine = railLines.features.find(
                    ({ properties: { NAME } }) => name === NAME
                  );
                  return priorities.map(({ range, lineCap }, index) => [
                    // non-transparent underlay. not visible.
                    <GeoJSON
                      key={`${name}-${p}-${index}-fake`}
                      opacity={1}
                      data={{
                        type: 'Feature',
                        geometry: {
                          type: 'LineString',
                          coordinates: railLine.geometry.coordinates.slice(
                            range[0],
                            range[1] + 2
                          )
                        }
                      }}
                      lineCap={lineCap}
                      weight={p * 4}
                      color={'#2b2b2b'}
                    />,
                    // real colored line
                    <GeoJSON
                      key={`${name}-${p}-${index}-real`}
                      opacity={0.6}
                      data={{
                        type: 'Feature',
                        geometry: {
                          type: 'LineString',
                          coordinates: railLine.geometry.coordinates.slice(
                            range[0],
                            range[1] + 2
                          )
                        }
                      }}
                      lineCap={lineCap}
                      weight={p * 4}
                      color={LINE_PROPERTIES[name]['color']}
                    />
                  ]);
                });
              })}
          </CustomLayerGroup>
          <CustomLayerGroup onReady={this.handleRailStationsReady}>
            {railStations &&
              railStations.map(
                ({ Code, Name, Lat, Lon, LineCode1, LineCode2, LineCode3 }) => {
                  const lineNames = [LineCode1, LineCode2, LineCode3].map(c => {
                    return LINE_NAMES.find(
                      l => LINE_PROPERTIES[l]['code'] === c
                    );
                  });
                  if (
                    !lineNames.some(name => visibleRailLines.includes(name))
                  ) {
                    return false;
                  }
                  return (
                    <CircleMarker
                      onReady={this.handleRailStationsReady}
                      key={Code}
                      radius={4}
                      color={'black'}
                      opacity={1}
                      fillOpacity={1}
                      fillColor="white"
                      onClick={() => this.handleStationClick(Code)}
                      center={[Lat, Lon]}
                    />
                  );
                }
              )}
          </CustomLayerGroup>
          <CustomLayerGroup onReady={this.handleTrainsLayerReady}>
            {trains &&
              trains.map(t => {
                const { geometry, properties } = t;
                const {
                  TRACKLINE,
                  ITT,
                  DEST_STATION,
                  TRIP_DIRECTION,
                  closestLineSegment
                } = properties;
                const [Lat, Lon] = geometry['coordinates'];
                const lineName = LINE_NAMES.find(
                  name => LINE_PROPERTIES[name]['trackLineID'] === TRACKLINE
                );
                if (!visibleRailLines.includes(lineName)) {
                  return false;
                }
                const lineProperties = LINE_PROPERTIES[lineName];
                let nearestSegmentCoords = [
                  t.properties.closestLineSegment.l.geometry.coordinates[0],
                  t.properties.closestLineSegment.l.geometry.coordinates[1]
                ];
                if (TRIP_DIRECTION === '2') {
                  nearestSegmentCoords = nearestSegmentCoords.reverse();
                }
                if (lineProperties['invertGeometry']) {
                  nearestSegmentCoords = nearestSegmentCoords.reverse();
                }
                const offsetLine = lineString(
                  offsetLatLngs(nearestSegmentCoords, zoom)
                );
                const nearestOnLine = nearestPointOnLine(
                  offsetLine,
                  point([Lon, Lat])
                );
                return (
                  <TrainMarker
                    key={`${ITT}-${zoom}`}
                    color={lineProperties['color']}
                    borderColor={lineProperties['complementColor']}
                    direction={lineProperties['directions'][TRIP_DIRECTION]}
                    rotationAngle={properties['rotationAngle']}
                    opacity={1}
                    fillOpacity={1}
                    position={L.latLng([
                      nearestOnLine.geometry.coordinates[1],
                      nearestOnLine.geometry.coordinates[0]
                    ])}>
                    <Popup>
                      <div>
                        <div>Destination: {DEST_STATION}</div>
                        <div>Direction: {TRIP_DIRECTION}</div>
                        <div>{ITT}</div>
                        <div>
                          {Lat}, {Lon}
                        </div>
                      </div>
                    </Popup>
                  </TrainMarker>
                );
              })}
          </CustomLayerGroup>
        </Map>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  trains: state.trains.trains,
  railStations: state.railStations.railStations,
  railLines: state.railLines.railLines,
  visibleRailLines: state.visibleRailLines
});

const mapDispatchToProps = dispatch =>
  bindActionCreators(
    {
      fetchTrains,
      fetchRailStations,
      fetchRailLines,
      setSelectedRailStations
    },
    dispatch
  );

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(MetroMap);