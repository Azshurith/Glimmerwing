import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

/** A chat message on a channel ('world'; friends', lobbies' and guilds' channels later). */
@Entity('chat_messages')
export class ChatRow extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @Column({ type: 'varchar', length: 40 })
    channel!: string;

    @Column({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    @Column({ type: 'varchar', length: 200 })
    body!: string;
}
