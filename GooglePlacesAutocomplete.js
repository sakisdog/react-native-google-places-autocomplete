/* eslint-disable react-native/no-inline-styles */
import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import Qs from 'qs';
import React, {
  forwardRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const defaultStyles = {
  container: {
    flex: 1,
  },
  textInputContainer: {
    flexDirection: 'row',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    height: 44,
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 15,
    flex: 1,
    marginBottom: 5,
  },
  listView: {},
  row: {
    backgroundColor: '#FFFFFF',
    padding: 13,
    minHeight: 44,
    flexDirection: 'row',
  },
  loader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    height: 20,
  },
  description: {},
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c8c7cc',
  },
  poweredContainer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 5,
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
  },
  powered: {},
};

export const GooglePlacesAutocomplete = forwardRef(({
  autoFillOnNotFound = false,
  currentLocation = false,
  currentLocationLabel = 'Current location',
  debounce: debounceProp = 0,
  disableScroll = false,
  enableHighAccuracyLocation = true,
  enablePoweredByContainer = true,
  fetchDetails = false,
  filterReverseGeocodingByTypes = [],
  GooglePlacesDetailsQuery = {},
  GooglePlacesSearchQuery = {
    rankby: 'distance',
    type: 'restaurant',
  },
  GoogleReverseGeocodingQuery = {},
  inbetweenCompo,
  isRowScrollable = true,
  keyboardShouldPersistTaps = 'always',
  listEmptyComponent,
  listLoaderComponent,
  listHoverColor = '#ececec',
  listUnderlayColor = '#c8c7cc',
  listViewDisplayed: listViewDisplayedProp = 'auto',
  keepResultsAfterBlur = false,
  minLength = 0,
  nearbyPlacesAPI = 'GooglePlacesSearch',
  numberOfLines = 1,
  onFail = () => {},
  onNotFound = () => {},
  onPress = () => {},
  onTimeout = () => console.warn('google places autocomplete: request timeout'),
  placeholder = '',
  predefinedPlaces = [],
  predefinedPlacesAlwaysVisible = false,
  preProcess,
  query = {
    key: 'missing api key',
    language: 'en',
    types: 'geocode',
  },
  renderDescription,
  renderHeaderComponent,
  renderLeftButton,
  renderRightButton,
  renderRow,
  requestUrl,
  styles = {},
  suppressDefaultStyles = false,
  textInputHide = false,
  textInputProps = {},
  timeout = 20000,
  children,
  ...props
}, ref) => {
  let _results = [];
  let _requests = [];

  const hasNavigator = () => {
    if (navigator?.geolocation) {
      return true;
    } else {
      console.warn(
        'If you are using React Native v0.60.0+ you must follow these instructions to enable currentLocation: https://git.io/Jf4AR',
      );
      return false;
    }
  };

  const buildRowsFromResults = useCallback(
    (results, text) => {
      let res = [];
      const shouldDisplayPredefinedPlaces = text
        ? results.length === 0 && text.length === 0
        : results.length === 0;
      if (
        shouldDisplayPredefinedPlaces ||
        predefinedPlacesAlwaysVisible === true
      ) {
        res = [
          predefinedPlaces.filter(
            (place) => place?.description.length,
          ),
        ];

        if (currentLocation === true && hasNavigator()) {
          res.unshift({
            description: currentLocationLabel,
            isCurrentLocation: true,
          });
        }
      }

      res = res.map((place) => ({
        ...place,
        isPredefinedPlace: true,
      }));

      return [...res, ...results];
    },
    [
      currentLocation,
      currentLocationLabel,
      predefinedPlaces,
      predefinedPlacesAlwaysVisible,
    ],
  );

  const getRequestUrl = useCallback((requestUrl) => {
    if (requestUrl) {
      if (requestUrl.useOnPlatform === 'all') {
        return requestUrl.url;
      }
      if (requestUrl.useOnPlatform === 'web') {
        return Platform.select({
          web: requestUrl.url,
          default: 'https://maps.googleapis.com/maps/api',
        });
      }
    } else {
      return 'https://maps.googleapis.com/maps/api';
    }
  }, []);

  const getRequestHeaders = (requestUrl) => {
    return requestUrl?.headers || {};
  };

  const setRequestHeaders = (request, headers) => {
    Object.keys(headers).map((headerKey) =>
      request.setRequestHeader(headerKey, headers[headerKey]),
    );
  };

  const [stateText, setStateText] = useState('');
  const [dataSource, setDataSource] = useState(buildRowsFromResults([]));
  const [listViewDisplayed, setListViewDisplayed] = useState(
    listViewDisplayedProp === 'auto' ? false : listViewDisplayedProp,
  );
  const [url, setUrl] = useState(null);
  const [listLoaderDisplayed, setListLoaderDisplayed] = useState(false);

  const inputRef = useRef();

  useEffect(() => {
    setUrl(getRequestUrl(requestUrl));
  }, [getRequestUrl, requestUrl]);

  useEffect(() => {
    // This will load the search results after the query object ref gets changed
    _handleChangeText(stateText);
    return () => {
      _abortRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // useEffect(() => {
  //   // Update dataSource if predefinedPlaces changed
  //   setDataSource(buildRowsFromResults([]));
  // }, [buildRowsFromResults, predefinedPlaces]);

  useImperativeHandle(ref, () => ({
    setAddressText: (address) => {
      setStateText(address);
    },
    getAddressText: () => stateText,
    blur: () => inputRef.current.blur(),
    focus: () => inputRef.current.focus(),
    isFocused: () => inputRef.current.isFocused(),
    clear: () => inputRef.current.clear(),
    getCurrentLocation,
  }));

  const requestShouldUseWithCredentials = () =>
    url === 'https://maps.googleapis.com/maps/api';

  const _abortRequests = () => {
    _requests.map((i) => {
      i.onreadystatechange = null;
      i.abort();
    });
    _requests = [];
  };

  const supportedPlatform = () => {
    if (Platform.OS === 'web' && !requestUrl) {
      console.warn(
        'This library cannot be used for the web unless you specify the requestUrl prop. See https://git.io/JflFv for more for details.',
      );
      return false;
    } else {
      return true;
    }
  };

  const getCurrentLocation = () => {
    let options = {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 1000,
    };

    if (enableHighAccuracyLocation && Platform.OS === 'android') {
      options = {
        enableHighAccuracy: true,
        timeout: 20000,
      };
    }
    const getCurrentPosition =
      navigator.geolocation.getCurrentPosition ||
      navigator.geolocation.default.getCurrentPosition;

    getCurrentPosition &&
      getCurrentPosition(
        (position) => {
          if (nearbyPlacesAPI === 'None') {
            let currentLocation = {
              description: currentLocationLabel,
              geometry: {
                location: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                },
              },
            };

            _disableRowLoaders();
            onPress(currentLocation, currentLocation);
          } else {
            _requestNearby(position.coords.latitude, position.coords.longitude);
          }
        },
        (error) => {
          _disableRowLoaders();
          console.error(error.message);
        },
        options,
      );
  };

  const _onPress = (rowData) => {
    if (rowData.isPredefinedPlace !== true && fetchDetails === true) {
      if (rowData.isLoading === true) {
        // already requesting
        return;
      }

      Keyboard.dismiss();

      _abortRequests();

      // display loader
      _enableRowLoader(rowData);

      // fetch details
      const request = new XMLHttpRequest();
      _requests.push(request);
      request.timeout = timeout;
      request.ontimeout = onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) return;

        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);

          if (responseJSON.status === 'OK') {
            // if (_isMounted === true) {
            const details = responseJSON.result;
            _disableRowLoaders();
            _onBlur();

            setStateText(_renderDescription(rowData));

            delete rowData.isLoading;
            onPress(rowData, details);
            // }
          } else {
            _disableRowLoaders();

            if (autoFillOnNotFound) {
              setStateText(_renderDescription(rowData));
              delete rowData.isLoading;
            }

            if (!onNotFound) {
              console.warn(
                'google places autocomplete: ' + responseJSON.status,
              );
            } else {
              onNotFound(responseJSON);
            }
          }
        } else {
          _disableRowLoaders();

          if (!onFail) {
            console.warn(
              'google places autocomplete: request could not be completed or has been aborted',
            );
          } else {
            onFail('request could not be completed or has been aborted');
          }
        }
      };

      request.open(
        'GET',
        `${url}/place/details/json?` +
          Qs.stringify({
            key: query.key,
            placeid: rowData.place_id,
            language: query.language,
            ...GooglePlacesDetailsQuery,
          }),
      );

      request.withCredentials = requestShouldUseWithCredentials();
      setRequestHeaders(request, getRequestHeaders(requestUrl));

      request.send();
    } else if (rowData.isCurrentLocation === true) {
      // display loader
      _enableRowLoader(rowData);

      setStateText(_renderDescription(rowData));

      delete rowData.isLoading;
      getCurrentLocation();
    } else {
      setStateText(_renderDescription(rowData));

      _onBlur();
      delete rowData.isLoading;
      let predefinedPlace = _getPredefinedPlace(rowData);

      // sending predefinedPlace as details for predefined places
      onPress(predefinedPlace, predefinedPlace);
    }
  };

  const _enableRowLoader = (rowData) => {
    let rows = buildRowsFromResults(_results);
    for (let i = 0; i < rows.length; i++) {
      if (
        rows[i].place_id === rowData.place_id ||
        (rows[i].isCurrentLocation === true &&
          rowData.isCurrentLocation === true)
      ) {
        rows[i].isLoading = true;
        setDataSource(rows);
        break;
      }
    }
  };

  const _disableRowLoaders = () => {
    // if (_isMounted === true) {
    for (let i = 0; i < _results.length; i++) {
      if (_results[i].isLoading === true) {
        _results[i].isLoading = false;
      }
    }

    setDataSource(buildRowsFromResults(_results));
    // }
  };

  const _getPredefinedPlace = (rowData) => {
    if (rowData.isPredefinedPlace !== true) {
      return rowData;
    }

    for (let i = 0; i < predefinedPlaces.length; i++) {
      if (predefinedPlaces[i].description === rowData.description) {
        return predefinedPlaces[i];
      }
    }

    return rowData;
  };

  const _filterResultsByTypes = (unfilteredResults, types) => {
    if (types.length === 0) return unfilteredResults;

    const results = [];
    for (let i = 0; i < unfilteredResults.length; i++) {
      let found = false;

      for (let j = 0; j < types.length; j++) {
        if (unfilteredResults[i].types.indexOf(types[j]) !== -1) {
          found = true;
          break;
        }
      }

      if (found === true) {
        results.push(unfilteredResults[i]);
      }
    }
    return results;
  };

  const _requestNearby = (latitude, longitude) => {
    _abortRequests();

    if (
      latitude !== undefined &&
      longitude !== undefined &&
      latitude !== null &&
      longitude !== null
    ) {
      const request = new XMLHttpRequest();
      _requests.push(request);
      request.timeout = timeout;
      request.ontimeout = onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          setListLoaderDisplayed(true);
          return;
        }

        setListLoaderDisplayed(false);
        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);

          _disableRowLoaders();

          if (typeof responseJSON.results !== 'undefined') {
            // if (_isMounted === true) {
            var results = [];
            if (nearbyPlacesAPI === 'GoogleReverseGeocoding') {
              results = _filterResultsByTypes(
                responseJSON.results,
                filterReverseGeocodingByTypes,
              );
            } else {
              results = responseJSON.results;
            }

            setDataSource(buildRowsFromResults(results));
            // }
          }
          if (typeof responseJSON.error_message !== 'undefined') {
            if (!onFail)
              console.warn(
                'google places autocomplete: ' + responseJSON.error_message,
              );
            else {
              onFail(responseJSON.error_message);
            }
          }
        } else {
          // console.warn("google places autocomplete: request could not be completed or has been aborted");
        }
      };

      let requestUrl = '';
      if (nearbyPlacesAPI === 'GoogleReverseGeocoding') {
        // your key must be allowed to use Google Maps Geocoding API
        requestUrl =
          `${url}/geocode/json?` +
          Qs.stringify({
            latlng: latitude + ',' + longitude,
            key: query.key,
            ...GoogleReverseGeocodingQuery,
          });
      } else {
        requestUrl =
          `${url}/place/nearbysearch/json?` +
          Qs.stringify({
            location: latitude + ',' + longitude,
            key: query.key,
            ...GooglePlacesSearchQuery,
          });
      }

      request.open('GET', requestUrl);

      request.withCredentials = requestShouldUseWithCredentials();
      setRequestHeaders(request, getRequestHeaders(requestUrl));

      request.send();
    } else {
      _results = [];
      setDataSource(buildRowsFromResults([]));
    }
  };

  const _request = (text) => {
    _abortRequests();
    if (!url) {
      return;
    }
    if (supportedPlatform() && text && text.length >= minLength) {
      const request = new XMLHttpRequest();
      _requests.push(request);
      request.timeout = timeout;
      request.ontimeout = onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          setListLoaderDisplayed(true);
          return;
        }

        setListLoaderDisplayed(false);
        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);
          if (typeof responseJSON.predictions !== 'undefined') {
            // if (_isMounted === true) {
            const results =
              nearbyPlacesAPI === 'GoogleReverseGeocoding'
                ? _filterResultsByTypes(
                    responseJSON.predictions,
                    filterReverseGeocodingByTypes,
                  )
                : responseJSON.predictions;

            _results = results;
            setDataSource(buildRowsFromResults(results, text));
            // }
          }
          if (typeof responseJSON.error_message !== 'undefined') {
            if (!onFail)
              console.warn(
                'google places autocomplete: ' + responseJSON.error_message,
              );
            else {
              onFail(responseJSON.error_message);
            }
          }
        } else {
          // console.warn("google places autocomplete: request could not be completed or has been aborted");
        }
      };

      if (preProcess) {
        setStateText(preProcess(text));
      }

      request.open(
        'GET',
        `${url}/place/autocomplete/json?input=` +
          encodeURIComponent(text) +
          '&' +
          Qs.stringify(query),
      );

      request.withCredentials = requestShouldUseWithCredentials();
      setRequestHeaders(request, getRequestHeaders(requestUrl));

      request.send();
    } else {
      _results = [];
      setDataSource(buildRowsFromResults([]));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debounceData = useMemo(() => debounce(_request, debounce), [
    query,
    url,
  ]);

  const _onChangeText = (text) => {
    setStateText(text);
    debounceData(text);
  };

  const _handleChangeText = (text) => {
    _onChangeText(text);

    const onChangeText = props?.textInputProps?.onChangeText;

    if (onChangeText) {
      onChangeText(text);
    }
  };

  const _getRowLoader = () => {
    return <ActivityIndicator animating={true} size='small' />;
  };

  const _renderRowData = (rowData, index) => {
    if (renderRow) {
      return renderRow(rowData, index);
    }

    return (
      <Text
        style={[
          suppressDefaultStyles ? {} : defaultStyles.description,
          styles.description,
          rowData.isPredefinedPlace
            ? styles.predefinedPlacesDescription
            : {},
        ]}
        numberOfLines={numberOfLines}
      >
        {_renderDescription(rowData)}
      </Text>
    );
  };

  const _renderDescription = (rowData) => {
    if (renderDescription) {
      return renderDescription(rowData);
    }

    return rowData.description || rowData.formatted_address || rowData.name;
  };

  const _renderLoader = (rowData) => {
    if (rowData.isLoading === true) {
      return (
        <View
          style={[
            suppressDefaultStyles ? {} : defaultStyles.loader,
            styles.loader,
          ]}
        >
          {_getRowLoader()}
        </View>
      );
    }

    return null;
  };

  const _renderRow = (rowData = {}, index) => {
    return (
      <ScrollView
        contentContainerStyle={
          isRowScrollable ? { minWidth: '100%' } : { width: '100%' }
        }
        scrollEnabled={isRowScrollable}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ hovered, pressed }) => [
            isRowScrollable ? { minWidth: '100%' } : { width: '100%' },
            {
              backgroundColor: pressed
                ? listUnderlayColor
                : hovered
                ? listHoverColor
                : undefined,
            },
          ]}
          onPress={() => _onPress(rowData)}
          onBlur={_onBlur}
        >
          <View
            style={[
              suppressDefaultStyles ? {} : defaultStyles.row,
              styles.row,
              rowData.isPredefinedPlace ? styles.specialItemRow : {},
            ]}
          >
            {_renderLoader(rowData)}
            {_renderRowData(rowData, index)}
          </View>
        </Pressable>
      </ScrollView>
    );
  };

  const _renderSeparator = (sectionID, rowID) => {
    if (rowID === dataSource.length - 1) {
      return null;
    }

    return (
      <View
        key={`${sectionID}-${rowID}`}
        style={[
          suppressDefaultStyles ? {} : defaultStyles.separator,
          styles.separator,
        ]}
      />
    );
  };

  const isNewFocusInAutocompleteResultList = ({
    relatedTarget,
    currentTarget,
  }) => {
    if (!relatedTarget) return false;

    var node = relatedTarget.parentNode;

    while (node) {
      if (node.id === 'result-list-id') return true;
      node = node.parentNode;
    }

    return false;
  };

  const _onBlur = (e) => {
    if (e && isNewFocusInAutocompleteResultList(e)) return;

    if (!keepResultsAfterBlur) {
      setListViewDisplayed(false);
    }
    inputRef?.current?.blur();
  };

  const _onFocus = () => setListViewDisplayed(true);

  const _renderPoweredLogo = () => {
    if (!_shouldShowPoweredLogo()) {
      return null;
    }

    return (
      <View
        style={[
          suppressDefaultStyles ? {} : defaultStyles.row,
          defaultStyles.poweredContainer,
          styles.poweredContainer,
        ]}
      >
        <Image
          style={[
            suppressDefaultStyles ? {} : defaultStyles.powered,
            styles.powered,
          ]}
          resizeMode='contain'
          source={require('./images/powered_by_google_on_white.png')}
        />
      </View>
    );
  };

  const _shouldShowPoweredLogo = () => {
    if (!enablePoweredByContainer || dataSource.length === 0) {
      return false;
    }

    for (let i = 0; i < dataSource.length; i++) {
      let row = dataSource[i];

      if (
        !row.hasOwnProperty('isCurrentLocation') &&
        !row.hasOwnProperty('isPredefinedPlace')
      ) {
        return true;
      }
    }

    return false;
  };

  const _renderLeftButton = () => {
    if (renderLeftButton) {
      return renderLeftButton();
    }
  };

  const _renderRightButton = () => {
    if (renderRightButton) {
      return renderRightButton();
    }
  };

  const _getFlatList = () => {
    const keyGenerator = () => Math.random().toString(36).substr(2, 10);

    if (
      supportedPlatform() &&
      (stateText !== '' ||
        predefinedPlaces.length > 0 ||
        currentLocation === true) &&
      listViewDisplayed === true
    ) {
      return (
        <FlatList
          nativeID='result-list-id'
          scrollEnabled={!disableScroll}
          style={[
            suppressDefaultStyles ? {} : defaultStyles.listView,
            styles.listView,
          ]}
          data={dataSource}
          keyExtractor={keyGenerator}
          extraData={[dataSource, props]}
          ItemSeparatorComponent={_renderSeparator}
          renderItem={({ item, index }) => _renderRow(item, index)}
          ListEmptyComponent={
            listLoaderDisplayed
              ? listLoaderComponent
              : stateText.length > minLength && listEmptyComponent
          }
          ListHeaderComponent={
            renderHeaderComponent &&
            renderHeaderComponent(stateText)
          }
          ListFooterComponent={_renderPoweredLogo}
          {...props}
        />
      );
    }

    return null;
  };

  let {
    onFocus,
    onBlur,
    onChangeText, // destructuring here stops this being set after onChangeText={_handleChangeText}
    clearButtonMode,
    InputComp,
    ...userProps
  } = textInputProps;
  const TextInputComp = InputComp || TextInput;
  return (
    <View
      style={[
        suppressDefaultStyles ? {} : defaultStyles.container,
        styles.container,
      ]}
      pointerEvents='box-none'
    >
      {!textInputHide && (
        <View
          style={[
            suppressDefaultStyles ? {} : defaultStyles.textInputContainer,
            styles.textInputContainer,
          ]}
        >
          {_renderLeftButton()}
          <TextInputComp
            ref={inputRef}
            style={[
              suppressDefaultStyles ? {} : defaultStyles.textInput,
              styles.textInput,
            ]}
            value={stateText}
            placeholder={placeholder}
            onFocus={
              onFocus
                ? (e) => {
                    _onFocus();
                    onFocus(e);
                  }
                : _onFocus
            }
            onBlur={
              onBlur
                ? (e) => {
                    _onBlur(e);
                    onBlur(e);
                  }
                : _onBlur
            }
            clearButtonMode={clearButtonMode || 'while-editing'}
            onChangeText={_handleChangeText}
            {...userProps}
          />
          {_renderRightButton()}
        </View>
      )}
      {inbetweenCompo}
      {_getFlatList()}
      {children}
    </View>
  );
});





GooglePlacesAutocomplete.displayName = 'GooglePlacesAutocomplete';

export default { GooglePlacesAutocomplete };
