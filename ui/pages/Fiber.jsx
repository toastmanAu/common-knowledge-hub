import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export default function Fiber() {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    fetch('/api/fiber/channels').then(r => r.json()).then(setChannels).catch(() => {});
  }, []);
  return (
    <div class="page fiber">
      <h1>Fiber Channels</h1>
      {channels.length === 0
        ? <p class="empty">No open channels</p>
        : channels.map(c => <ChannelCard key={c.channel_id} channel={c} />)
      }
    </div>
  );
}

function ChannelCard({ channel }) {
  return (
    <div class="channel-card">
      <div class="channel-id">{channel.channel_id?.slice(0, 16)}...</div>
      <div class="channel-balance">{Number(BigInt(channel.local_balance || '0x0')) / 1e8} CKB</div>
      <div class={`channel-status ${channel.state?.toLowerCase()}`}>{channel.state}</div>
    </div>
  );
}
