import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const STATUS = {
  planned: { label: '예정', color: '#1a237e' },
  done: { label: '완료', color: '#4caf50' },
cancelled: { label: '취소', color: '#f44336' }
}

function makeMarkerImage(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26s14-16.667 14-26C28 6.268 21.732 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`
  return new window.kakao.maps.MarkerImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new window.kakao.maps.Size(28, 40),
    { offset: new window.kakao.maps.Point(14, 40) }
  )
}
function App() {
  const mapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [map, setMap] = useState(null)
  const [spots, setSpots] = useState([])
  const [form, setForm] = useState({ title: '', description: '', assignee: '', scheduled_at: '', status: 'planned' })
  const [showForm, setShowForm] = useState(false)
  const [clickPos, setClickPos] = useState(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const markersRef = useRef([])
  const psRef = useRef(null)
  const tempMarkerRef = useRef(null)

  useEffect(() => {
    if (window.kakao && window.kakao.maps) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${import.meta.env.VITE_KAKAO_MAP_KEY}&autoload=false&libraries=services`
    script.onload = () => window.kakao.maps.load(() => setMapLoaded(true))
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const kakaoMap = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(37.2636, 127.0286),
      level: 5
    })
    psRef.current = new window.kakao.maps.services.Places()
    window._kakaoMap = kakaoMap

    window.kakao.maps.event.addListener(kakaoMap, 'click', (mouseEvent) => {
      const latlng = mouseEvent.latLng
      const lat = latlng.getLat()
      const lng = latlng.getLng()

      if (tempMarkerRef.current) {
        tempMarkerRef.current.setMap(null)
        tempMarkerRef.current = null
      }

      tempMarkerRef.current = new window.kakao.maps.Marker({
        map: kakaoMap,
        position: new window.kakao.maps.LatLng(lat, lng)
      })

      setClickPos({ lat, lng })
      setShowForm(true)
    })

    setMap(kakaoMap)
  }, [mapLoaded])

  useEffect(() => {
    if (map) fetchSpots()
  }, [map])

  async function fetchSpots() {
    const { data } = await supabase.from('campaign_spots').select('*').order('scheduled_at', { ascending: true })
    if (data) setSpots(data)
  }

  useEffect(() => {
    if (!map) return
    markersRef.current.forEach(({ marker, infowindow }) => {
      infowindow.close()
      marker.setMap(null)
    })
    markersRef.current = []

    const filtered = filterDate
      ? spots.filter(s => s.scheduled_at && s.scheduled_at.slice(0, 10) === filterDate)
      : spots

    filtered.forEach(spot => {
      const color = STATUS[spot.status]?.color || STATUS.planned.color
      const marker = new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(spot.lat, spot.lng),
        title: spot.title,
        image: makeMarkerImage(color)
      })
      const infowindow = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:8px;font-size:13px;min-width:160px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <b>${spot.title}</b>
            <span onclick="window._deleteSpot('${spot.id}')" style="cursor:pointer;margin-left:8px;font-size:16px" title="삭제">🗑️</span>
          </div>
          <span style="padding:2px 6px;border-radius:4px;font-size:11px;background:${color};color:white">${STATUS[spot.status]?.label || '예정'}</span>
          ${spot.assignee ? '<br/>👤 ' + spot.assignee : ''}
          ${spot.scheduled_at ? '<br/>🕐 ' + spot.scheduled_at.slice(0, 16).replace('T', ' ') : ''}
        </div>`
      })
      window.kakao.maps.event.addListener(marker, 'click', () => {
        markersRef.current.forEach(m => m.infowindow.close())
        infowindow.open(map, marker)
      })
      markersRef.current.push({ marker, infowindow })
    })
  }, [map, spots, filterDate])

  window._deleteSpot = async (id) => {
    if (window.confirm('이 장소를 삭제할까요?')) {
      await supabase.from('campaign_spots').delete().eq('id', id)
      fetchSpots()
    }
  }

  function handleSearch() {
    if (!searchKeyword.trim() || !psRef.current) return
    psRef.current.keywordSearch(searchKeyword, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        const first = result[0]
        const lat = parseFloat(first.y)
        const lng = parseFloat(first.x)
        map.setCenter(new window.kakao.maps.LatLng(lat, lng))
        map.setLevel(3)
        setClickPos({ lat, lng })
        setForm(f => ({ ...f, title: first.place_name }))
        setShowForm(true)
      } else {
        alert('검색 결과가 없어요')
      }
    })
  }

  async function handleSubmit() {
    if (!form.title || !clickPos) return
    await supabase.from('campaign_spots').insert([{
      title: form.title,
      description: form.description,
      assignee: form.assignee,
      scheduled_at: form.scheduled_at || null,
      status: form.status,
      lat: clickPos.lat,
      lng: clickPos.lng
    }])
    if (tempMarkerRef.current) {
      tempMarkerRef.current.setMap(null)
      tempMarkerRef.current = null
    }
    setForm({ title: '', description: '', assignee: '', scheduled_at: '', status: 'planned' })
    setShowForm(false)
    setClickPos(null)
    fetchSpots()
  }

  async function handleDelete(id) {
    await supabase.from('campaign_spots').delete().eq('id', id)
    fetchSpots()
  }

  async function handleStatusChange(id, status) {
    await supabase.from('campaign_spots').update({ status }).eq('id', id)
    fetchSpots()
  }

  function moveToSpot(spot) {
    if (!map) return
    map.setCenter(new window.kakao.maps.LatLng(spot.lat, spot.lng))
    map.setLevel(3)
  }

  const filteredSpots = filterDate
    ? spots.filter(s => s.scheduled_at && s.scheduled_at.slice(0, 10) === filterDate)
    : spots

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', background: '#1a237e', color: 'white', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '18px', whiteSpace: 'nowrap' }}>🗺️ 유세맵</h1>
        <div style={{ display: 'flex', gap: '6px', flex: 1, maxWidth: '400px' }}>
          <input
            placeholder="장소 검색 (예: 용인시청)"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '13px' }}
          />
          <button onClick={handleSearch}
            style={{ padding: '6px 12px', background: '#ffd700', color: '#1a237e', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            검색
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '12px' }}>
          {Object.entries(STATUS).map(([key, { label, color }]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '300px', background: '#f8f9fa', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e0e0e0', background: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <b style={{ fontSize: '14px' }}>📋 유세 장소 목록</b>
              <span style={{ fontSize: '12px', color: '#888' }}>{filteredSpots.length}곳</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                style={{ flex: 1, padding: '5px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
              {filterDate && (
                <button onClick={() => setFilterDate('')}
                  style={{ padding: '5px 8px', background: '#eee', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  전체
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSpots.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                {filterDate ? '해당 날짜 일정이 없어요' : '지도를 클릭해서\n유세 장소를 추가하세요'}
              </div>
            )}
            {filteredSpots.map(spot => (
              <div key={spot.id}
                onClick={() => moveToSpot(spot)}
                style={{ padding: '12px 16px', borderBottom: '1px solid #eee', cursor: 'pointer', background: 'white', marginBottom: '2px' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: '14px', color: '#1a237e' }}>{spot.title}</b>
                  <button onClick={e => { e.stopPropagation(); handleDelete(spot.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f44336', fontSize: '16px', padding: '0' }}>
                    🗑️
                  </button>
                </div>
                {spot.assignee && <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>👤 {spot.assignee}</div>}
                {spot.scheduled_at && <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>🕐 {spot.scheduled_at.slice(0, 16).replace('T', ' ')}</div>}
                {spot.description && <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{spot.description}</div>}
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                  {Object.entries(STATUS).map(([key, { label, color }]) => (
                    <button key={key} onClick={() => handleStatusChange(spot.id, key)}
                      style={{
                        padding: '2px 8px', fontSize: '11px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                        background: spot.status === key ? color : '#eee',
                        color: spot.status === key ? 'white' : '#666'
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          {showForm && (
            <div style={{
              position: 'absolute', top: '20px', right: '20px', zIndex: 999,
              background: 'white', borderRadius: '12px', padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: '280px'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px' }}>📍 유세 장소 추가</h3>
              <input placeholder="장소명 *" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} />
              <input placeholder="담당자" value={form.assignee}
                onChange={e => setForm({ ...form, assignee: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} />
              <input type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }} />
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' }}>
                {Object.entries(STATUS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <textarea placeholder="메모" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '12px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box', height: '60px', resize: 'none' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSubmit}
                  style={{ flex: 1, padding: '8px', background: '#1a237e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  저장
                </button>
                <button onClick={() => {
                  if (tempMarkerRef.current) {
                    tempMarkerRef.current.setMap(null)
                    tempMarkerRef.current = null
                  }
                  setShowForm(false)
                  setClickPos(null)
                }}
                  style={{ flex: 1, padding: '8px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App