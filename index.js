const PlayMusic = require('playmusic')
const pm = new PlayMusic()

const convertTrack = (rawTrack, allAccess) => {

	let trackObject = {
		'service': 'playmusic',
		'title': rawTrack.title,
		'share_url': 'https://www.youtube.com/results?search_query=' + encodeURIComponent(rawTrack.artist + " " + rawTrack.title),
		'artist': {
			'name': rawTrack.artist,
			'id':  (rawTrack.artistId ? rawTrack.artistId[0] : md5(rawTrack.artist))
		},
		'album': {
			'name': rawTrack.album,
			'id': md5(rawTrack.artist+rawTrack.album)
		},
		'duration': rawTrack.durationMillis,
	}

	if (allAccess) trackObject.allAccess = true

	if (rawTrack.id) {
		trackObject.id = rawTrack.id
		if (rawTrack.storeId) trackObject.storeId = rawTrack.storeId
	} else {
		if (rawTrack.storeId) trackObject.id = rawTrack.storeId
	}

	if (rawTrack.lastRatingChangeTimestamp) trackObject.RatingTimestamp = rawTrack.lastRatingChangeTimestamp
	if (rawTrack.trackNumber) trackObject.trackNumber = rawTrack.trackNumber

	if (rawTrack.albumArtRef) trackObject.artwork = rawTrack.albumArtRef[0].url
	else if (rawTrack.imageBaseUrl) trackObject.artwork = rawTrack.imageBaseUrl
	else trackObject.artwork = ''

	return trackObject

}


class Playmusic {

    /**
	 * Fetch data
     * @param callback
     * @returns {Promise}
     */
    static fetchData (callback) {
			
		pm.init({ masterToken: settings.playmusic.masterToken }, (err, res) => {

			if (err) return callback([err, true])

			pm.getAllTracks({ limit : 49500 }, (err, library) => {
				if (err) return callback([err])

				let tempLibrary = []
				let tempFavs = []

				for (let i of library.data.items) {

					if (i.albumArtRef === undefined) {
						i.albumArtRef = [{
							'url': ""
						}]
					}

					tempLibrary.push(convertTrack(i))

					if (i.rating == 5)
						tempFavs.push(convertTrack(i))
				}

				sortBy(tempLibrary, 'artist')

				Data.addPlaylist({
					service: 'playmusic',
					title: 'Library',
					artwork: '',
					icon: 'note-beamed',
					id: 'library',
					tracks: tempLibrary
				})

				pm.getFavorites((err, favorites_data) => { // Works only when all-access
					if (err) callback([err])

					let added
					for (let f of favorites_data.track) {
						for (let z = 0; z < tempFavs.length; z++) {
							if (tempFavs[z].storeId == f.id ||
								(tempFavs[z].title == f.title && tempFavs[z].artist == f.artist)) { // Already in favs, but this one probably has better metadatas

								tempFavs[z] = convertTrack(f, true)

								added = true
								break
							}
							added = false
						}

						if (!added)
							tempFavs.push(convertTrack(f, true))

					}

					if (tempFavs.length > 0)
						tempFavs.sort( (a, b) => { // Sort by rating date
							if (typeof b.RatingTimestamp == 'undefined')
								return -1
							else if (typeof a.RatingTimestamp == 'undefined')
								return 1
							return b.RatingTimestamp - a.RatingTimestamp
						})


					Data.addPlaylist({
						service: 'playmusic',
						title: 'Thumbs up',
						artwork: '',
						id: 'favs',
						icon: 'thumbs-up',
						tracks: tempFavs
					})

					pm.getPlayLists((err, playlists_data) => {
						if (err) callback([err])

						pm.getPlayListEntries((err, playlists_entries_data) => {
							if (err) callback([err])

							let temp = {}

							if (playlists_data.data)
								for (let i of playlists_data.data.items) {
									temp[i.id] = []
								}


							if (playlists_entries_data.data)

								for (let t of playlists_entries_data.data.items) {

									if (t.playlistId) {

										if (t.track) { // If there is already track metadatas then it's an all access song
											if (!t.track.albumArtRef) {
												i.track.albumArtRef = [{ 'url': "" }]
											}

											temp[t.playlistId].push(convertTrack(t.track, true))
										} else {

											let track_object = null

											track_object = getTrackObject(tempLibrary, t.trackId)

											if (track_object) {
												temp[t.playlistId].push(track_object)
											}

										}
									}
								}

							for (let i of playlists_data.data.items) {
								Data.addPlaylist({
									service: 'playmusic',
									title: i.name,
									editable: true,
									canBeDeleted: true,
									id: i.id,
									tracks: temp[i.id]
								})
							}

							/*for (let p of data.playmusic)
								if (typeof p.tracks[0] != "undefined")
									p.artwork = p.tracks[0].artwork
								else p.artwork = ''*/

							callback()
						})
					})

					let ifl_id
					let temp_arr = []

					// get random song from thumbs up to create station

					for (let a of tempFavs)
						if (a.allAccess) temp_arr.push(tempFavs.id)

					ifl_id = temp_arr[Math.floor(Math.random() * tempFavs.length)]

					if (typeof ifl_id !== "undefined") {
						pm.createStation("I'm feeling lucky", ifl_id, "track", (err, station_data) => {

							if (err) return console.log(err) // We don't reject cause this can happen with non-all-access accounts

							pm.getStationTracks(station_data.mutate_response[0].id, 50, (err, station_tracks) => {
								if (err) return console.log(err)
								
								let tempTracks = []

								for (let t of station_tracks.data.stations[0].tracks)
									tempTracks.push(convertTrack(t))

								Data.addPlaylist({
									service: 'playmusic',
									id: 'ifl',
									title: "I'm feeling lucky",
									icon: 'star',
									artwork: (typeof pl.tracks[0] !== "undefined" ? pl.tracks[0].artwork : ''),
									tracks: tempTracks
								})

							})

						})
					}

				})
			})
		})

	}

	/**
	* View a track's artist
	*
	* @param track {Object} The track object
	*/

	static viewArtist (track) {
		let temp = []

		Data.findOne({service: 'playmusic', id: 'library'}, (err, pl) => {
			for (let tr of pl.tracks)
				if (tr.artist.id == track.artist.id)
					temp.push(tr)

			specialView('playmusic', temp, 'artist', track.artist.name)
		})
	
	}

	/**
    * View a track's album
    *
    * @param track {Object} The track object
    */

	static viewAlbum (track) {
		let temp = []

		Data.findOne({service: 'playmusic', id: 'library'}, (err, pl) => {
			for (let tr of pl.tracks)
				if (tr.album.id == track.album.id)
					temp.push(tr)

			specialView('playmusic', temp, 'album', track.album.name, track.artwork)
		})
	}

	/**
	 * Search
	 * @param query {String}: the query of the search
	 * @param callback
	 */
	static searchTracks (query, callback) {
		let tracks = []

		Data.findOne({service: 'playmusic', id: 'library'}, (err, pl) => {
			for (let tr of pl.tracks)
				if (isSearched(tr, query))
					tracks.push(tr)
			callback(tracks, query)
		})
	}

	/**
	* Create a station based on a track
	*
	* @param track {Object} The track object
	*/

	static createStation (track) {

		pm.createStation("Station", track.id, "track", (err, station_data) => {

			if (err) return console.error(err)

			pm.getStationTracks(station_data.mutate_response[0].id, 50, (err, station_tracks) => {
				if (err) {
					console.error(err)
					return new Notification('Feature not available', {
						'body': 'Sorry, this feature is only available with all-access tracks.',
						'icon': track.artwork,
						'tag': 'Harmony-playTrack',
						'origin': 'Harmony'
					})
				}

				var tracks = []

				for (let t of station_tracks.data.stations[0].tracks)
					tracks.push(convertTrack(t))
				
				specialView('playmusic', tracks, 'station', "From "+track.title)

			})
		})
	}

	/**
	* Called when user wants to activate the service
	*
	* @param callback {function}
	*/

	static login (callback) {
		let fields = [
			{
				description: 'Google Email adress',
				placeholder: 'Email adress',
				id: 'user',
				type: 'email'
			},
			{
				description: 'Password',
				placeholder: 'Password',
				id: 'password',
				type: 'password'
			},
			{
				content: `<a href='#' onclick="require('electron').shell.openExternal('https://getharmony.xyz/faq')">Using 2-steps authentication ?</a>`,
				type: 'html'
			},
		]

		manualLogin(fields, (creds) => {

			if (!creds || !creds.user || !creds.password) return callback('stopped')

			settings.playmusic.user = creds.user

			pm.login({ email: creds.user, password: creds.password }, (err, result) => { // fetch auth token
				if (err) return callback(err)

				settings.playmusic.masterToken = result.masterToken
				callback()

			})

		})

	}

	/**
	* Create a Playlist
	*
	* @param name {String} The name of the playlist to be created
	*/
	static createPlaylist (name, callback) {

		pm.addPlayList(name, (err, result) => {

			if (err) return callback(err)

			callback(null, {
				service: 'playmusic',
				editable: true,
				canBeDeleted: true,
				title: name,
				id: result.mutate_response[0].id,
				tracks: []
			})

		})

	}

	/**
	* Delete a Playlist (unfollowing it is Spotify's way)
	*
	* @param playlist {Object} The object of the playlist to be deleted
	*/
	static deletePlaylist (playlist, callback) {

		pm.deletePlayList(playlist.id, (err, result) => {

			callback(err)

		})

	}

	/**
	* Add a track to a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static addToPlaylist (tracks, playlistId, callback) {
		let ids = []

		for (let track of tracks)
			ids.push(track.id)

		pm.addTrackToPlayList(ids, playlistId, (err, result) => {
			callback(err)
		})
	}



	/**
	* Remove a track from a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static removeFromPlaylist (tracks, playlistId, callback) {
		let ids = []

		pm.getPlayListEntries((error, playlists_entries_data) => {
			if (error) return callback(error)

			for (let t of playlists_entries_data.data.items) {
				if (t.playlistId !== playlistId) continue

				for (let tr of tracks)
					if (t.trackId === tr.id)
						ids.push(t.id)
			}

			pm.removePlayListEntry(ids, (err, result) => {
				callback(err)
			})

		})
	}



	/**
	* Like a song
	*
	* @param track {Object} The track object
	*/

	static like (track, callback) {
		pm.getAllTracks({ limit : 49500 }, (err, library) => {
			if (err) return callback(err)

			let song = getTrackObject(library.data.items, track.id)

			if (!song) {
				pm.getAllAccessTrack(track.id, (err, tr) => {
					if (err) return callback(err)

					tr['rating'] = "5"
					pm.changeTrackMetadata(tr, (err, result) => {
						callback(err)
					})
				})
			} else {
				song['rating'] = "5"
				pm.changeTrackMetadata(song, (err, result) => {
					callback(err)
				})
			}

		})
	}

	/**
	* Unlike a song
	*
	* @param track {Object} The track object
	*/

	static unlike (track, callback) {
		pm.getAllTracks({ limit : 49500 }, (err, library) => {
			if (err) return callback(err)

			let song = getTrackObject(library.data.items, track.id)

			if (!song) {
				pm.getAllAccessTrack(track.id, (err, tr) => {
					if (err) return callback(err)

					tr['rating'] = "0"
					pm.changeTrackMetadata(tr, (err, result) => {
						callback(err)
					})
				})
			} else {
				song['rating'] = "0"
				pm.changeTrackMetadata(song, (err, result) => {
					callback(err)
				})
			}

		})
	}

	/**
	* Gets a track's streamable URL
	*
	* @param track {Object} The track object
	* @param callback {Function} The callback function
	*/

	static getStreamUrl (track, callback) {
		pm.getStreamUrl(track.id, (err, streamUrl) => {

			if (err) callback(err, null, track.id)
			else callback(null, streamUrl, track.id)
			
		})	
	}

	/**
	* Called when a track ended
	*/
	
	static onTrackEnded (track) {
		pm.incrementTrackPlaycount(track.id, (err, res) => {
			if (err) console.error(err)
		})
	}
	

	/**
	* Called when app is started
	*
	*/

	static appStarted() {
		pm.init({ masterToken: settings.playmusic.masterToken }, (err, res) => {
			if (err) console.error(err)
		})
	}

	/*
	* Returns the settings items of this plugin
	*
	*/
	static settingsItems () {
		return [
			{
				type: 'activate',
				id: 'active'
			}
		]
	}

	/*
	* Returns the context menu items of this plugin
	*
	* @param tracks {Array of Objects} The selected tracks object
	*/
	static contextmenuItems (tracks) {
		return [
			{
				label: 'View artist',
				click: () => { Playmusic.viewArtist(tracks[0]) }
			},

			{
				label: 'View album',
				click: () => { Playmusic.viewAlbum(tracks[0]) }
			},

			{
				label: 'Start station',
				click: () => { Playmusic.createStation(tracks[0]) }
			}
		]
	}

}


/** Static Properties **/
Playmusic.favsPlaylistId = "favs"
Playmusic.scrobbling = true
Playmusic.settings = {
	user: '',
	active: false
}

module.exports = Playmusic