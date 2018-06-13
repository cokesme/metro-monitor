import { SET_VISIBLE_RAIL_LINES } from '../actions/controls';
import { LINE_NAMES } from 'common/constants/lines';

const initialVisibleRailLines = [].concat(LINE_NAMES);

const visibleRailLines = (state = initialVisibleRailLines, action) => {
  switch (action.type) {
    case SET_VISIBLE_RAIL_LINES:
      return action.payload.visibleRailLines;
    default:
      return state;
  }
};

export { visibleRailLines };