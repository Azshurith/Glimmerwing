import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped, asJson, asNumber } from './columns';

/** A saved replay: the game's recording, shared by a short code. */
@Entity('players_replays')
export class ReplayRow extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @Column({ type: 'char', length: 10 })
    code!: string;

    @Column({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    /** A types_modes id. */
    @Column({ name: 'mode_id', type: 'int', unsigned: true })
    modeId!: number;

    /** A maps id. */
    @Column({ name: 'map_id', type: 'int', unsigned: true })
    mapId!: number;

    /** The simulation build it was recorded on. */
    @Column({ type: 'varchar', length: 16 })
    version!: string;

    @Column({ type: 'double', default: 0 })
    seconds!: number;

    /** When the browser recorded it (its clock, ms), so one game is never counted twice. */
    @Column({ type: 'bigint', nullable: true, transformer: asNumber })
    recorded!: number | null;

    @Column({ type: 'longtext', transformer: asJson })
    data!: object;
}
